import assert from "node:assert/strict";
import { readPresentationSource as readFile } from "../../scripts/read-presentation-source.mjs";
import test from "node:test";
import { createDocumentLifecycleScopeTracker } from "./documentLifecycleScope.js";

const read = (relativeUrl) => readFile(new URL(relativeUrl, import.meta.url), "utf8");

test("a scope captured in the first A session stays stale after A to B to A", () => {
  const tracker = createDocumentLifecycleScopeTracker();
  tracker.observeSignature("document-a");
  const firstAScope = tracker.capture();

  tracker.advance();
  tracker.observeSignature("document-b");
  tracker.advance();
  tracker.observeSignature("document-a");

  assert.equal(tracker.isCurrent(firstAScope), false);
  assert.equal(tracker.isCurrent(tracker.capture(), true), true);
});

test("same-session revision changes invalidate strict async scopes", () => {
  const tracker = createDocumentLifecycleScopeTracker();
  tracker.observeSignature("revision-1");
  const requestScope = tracker.capture();

  tracker.observeSignature("revision-2");

  assert.equal(tracker.isCurrent(requestScope), true);
  assert.equal(tracker.isCurrent(requestScope, true), false);
});

test("document lifecycle context exposes the operation commit contract", async () => {
  const [source, canvas] = await Promise.all([
    read("../store/document-lifecycle-context.jsx"),
    read("../pages/PdfCanvas.jsx"),
  ]);

  assert.match(source, /sessionKey:/);
  assert.match(source, /beginOperation/);
  assert.match(source, /canCommit/);
  assert.match(canvas, /const commitDocumentSnapshot = useCallback/);
  assert.match(canvas, /commitDocumentSnapshot,/);
});

test("all asynchronous template fills reject stale document revisions", async () => {
  const [applyHook, canvas] = await Promise.all([
    read("../hooks/useApplyCvTemplate.js"),
    read("../pages/PdfCanvas.jsx"),
  ]);

  for (const source of [applyHook, canvas]) {
    assert.match(source, /const requestScope = captureDocumentScope\(\)/);
    assert.match(source, /isDocumentScopeCurrent\(requestScope, \{ requireSameRevision: true \}\)/);
  }
});

test("saved-document open checks scope before replacing the canvas", async () => {
  const source = await read("../components/modals/ModalPdfs/ModalPdfs.jsx");

  assert.match(source, /const requestScope = captureDocumentScope\(\)/);
  assert.match(source, /isDocumentScopeCurrent\(requestScope, \{ requireSameRevision: true \}\)/);
  assert.match(source, /commitDocumentSnapshot\(\{/);
  assert.match(source, /\}, \{ markClean: true \}\)/);
});

test("document management uses one dialog state and recovery suspends standard dialogs", async () => {
  const [documents, shell, unsaved, canvas] = await Promise.all([
    read("../components/modals/ModalPdfs/ModalPdfs.jsx"),
    read("../components/common/DialogShell/DialogShell.jsx"),
    read("../components/common/UnsavedChangesDialog/UnsavedChangesDialog.jsx"),
    read("../pages/PdfCanvas.jsx"),
  ]);

  assert.equal(
    (documents.match(/<DialogShell/g) || []).length,
    1,
    "the delete confirmation must be a state of the documents dialog, not a nested modal",
  );
  assert.match(documents, /deleteConfirmationOpen \? "alertdialog" : "dialog"/);
  assert.match(shell, /DialogSuspensionContext/);
  assert.match(shell, /layer === "recovery"/);
  assert.match(unsaved, /layer="recovery"/);
  assert.match(canvas, /dialogsSuspended=\{dirtyGuard\.dialogOpen\}/);
  assert.match(shell, /width=\{isDecision \|\| isFullscreen \? 44 : 36\}/);
  assert.match(shell, /height=\{isDecision \|\| isFullscreen \? 44 : 36\}/);
});

test("complete replacements share one atomic snapshot commit", async () => {
  const [canvas, documents, setup, templates] = await Promise.all([
    read("../pages/PdfCanvas.jsx"),
    read("../components/modals/ModalPdfs/ModalPdfs.jsx"),
    read("../components/editor/CvOnboarding/CvOnboarding.jsx"),
    read("../components/modals/TemplatesModal/TemplatesModal.jsx"),
  ]);
  const commit = canvas.match(
    /const commitDocumentSnapshot = useCallback\([\s\S]*?const documentLifecycle = useMemo/,
  )?.[0] || "";

  for (const setter of [
    "setA4_Elements", "setA4_Elements_deleted", "setDocumentTitle", "setPageCount",
    "setActiveTemplateId", "setEditorMode", "setActiveCvData", "setActiveImportId",
    "setPdfId", "setServerRevision",
  ]) {
    assert.match(commit, new RegExp(`${setter}\\(`), `${setter} must belong to the commit boundary`);
  }
  assert.match(documents, /commitDocumentSnapshot\(\{[\s\S]*pdfId: id[\s\S]*serverRevision:/);
  assert.ok(setup.includes("await onCreate(draft.config, { replacementConfirmed, isCurrent: current })"));
  assert.match(canvas, /loadAiElementsFresh\(response\.elements[\s\S]*\{[\s\S]*cvData,/);
  assert.match(templates, /loadAiElements\([\s\S]*\{ cvData: profile \}/);
});

test("controller/view and AI lazy boundaries are explicit", async () => {
  const canvas = await read("../pages/PdfCanvas.jsx");

  assert.match(canvas, /export function EditorView\(/);
  assert.match(canvas, /export function EditorController\(/);
  assert.match(canvas, /<EditorView[\s\S]*documentLifecycle=\{documentLifecycle\}/);
  for (const component of ["AiAssistant"]) {
    assert.match(canvas, new RegExp(`lazy\\(\\(\\) => import\\('[^']*${component}`));
    assert.doesNotMatch(canvas, new RegExp(`^import ${component} from`, "m"));
  }
  assert.ok(canvas.includes("<CvOnboarding"));
});

test("dirty guard saves before continuing and retains failures", async () => {
  const [guard, canvas, dialog] = await Promise.all([
    read("../hooks/useDirtyGuard.js"),
    read("../pages/PdfCanvas.jsx"),
    read("../components/common/UnsavedChangesDialog/UnsavedChangesDialog.jsx"),
  ]);

  assert.match(guard, /const confirmDialogSave = useCallback\(async/);
  assert.match(guard, /await saveCurrentDocument\(\)/);
  assert.match(guard, /settleDialog\(true\)/);
  assert.match(guard, /catch \(error\) \{[\s\S]*setDialogError/);
  assert.match(canvas, /markDocumentClean\(saveSignatureRef\.current\)[\s\S]*settleDialogSave\(true\)/);
  assert.match(canvas, /responsePDF\?\.message[\s\S]*settleDialogSave\(false/);
  assert.match(dialog, /Zapisz i kontynuuj/);
});

test("editor title and token verification use the controlled and header-only contracts", async () => {
  const [canvas, topbar] = await Promise.all([
    read("../pages/PdfCanvas.jsx"),
    read("../components/editor/Topbar/Topbar.jsx"),
  ]);

  assert.match(topbar, /value={title}/);
  assert.match(topbar, /onChange={\(event\) => onTitleChange\(event\.target\.value\)}/);
  assert.match(canvas, /new ApiClient\(\{ Authorization: `Bearer \$\{token\}` \}\)/);
  assert.match(canvas, /httpRequest\(ENDPOINTS\.AUTH\.TOKEN, "GET"/);
  assert.doesNotMatch(canvas, /ENDPOINTS\.AUTH\.TOKEN \+ token/);
});

test("central dirty guard covers router and browser exits", async () => {
  const source = await read("../hooks/useDirtyGuard.js");

  assert.match(source, /useBlocker/);
  assert.match(source, /window\.addEventListener\("beforeunload"/);
  assert.match(source, /window\.addEventListener\("pagehide"/);
  assert.match(source, /flushGuestDraftRef\.current\?\.\(\)/);
});
