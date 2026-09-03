/**
 * Apply a registry template onto the current CV without starting a new document.
 *
 * Shared by the change-template modal and the topbar prev/next arrows so both
 * paths call `/ai/fill_template` with generator-default spacing and then
 * `replaceActiveElements` (keeps pdfId + title).
 */
import { useCallback, useMemo, useState } from "react";
import { useCanvasContext } from "../store/canvas-context";
import { useSession } from "../store/session-context";
import { ApiClient } from "../services/api";
import { fillTemplate } from "../services/fillTemplate";
import { isTemplateAllowed, planErrorMessage } from "../utils/entitlements";
import { DEFAULT_FLOW_SPACING } from "../utils/flowSpacing";
import { getAccessToken } from "../utils/authSession";
import { useDocumentLifecycle } from "../store/document-lifecycle-context";
import { syncGeneratedLanguagesForTemplateSwitch } from "../utils/syncCvDataFromCanvas";
import { prepareStarterProfileForTemplate } from "../utils/cvStarter.js";

/**
 * @returns {{
 *   applyTemplate: (template: object) => Promise<boolean>,
 *   fillingId: string|null,
 *   error: string|null,
 *   setError: (value: string|null) => void,
 * }}
 */
export function useApplyCvTemplate() {
  const { captureDocumentScope, isDocumentScopeCurrent } = useDocumentLifecycle();
  const {
    A4_Elements,
    activeCvData,
    replaceActiveElements,
    adoptDocumentFlowSpacing,
  } = useCanvasContext();
  const { entitlements, pushToast } = useSession();

  const [fillingId, setFillingId] = useState(null);
  const [error, setError] = useState(null);

  const api = useMemo(() => {
    const token = getAccessToken();
    return new ApiClient(token ? { Authorization: `Bearer ${token}` } : {});
  }, []);

  const applyTemplate = useCallback(async (template) => {
    if (!activeCvData || !template) return false;
    if (!isTemplateAllowed(template, entitlements)) {
      setError("Ten szablon jest dostępny w planie Pro.");
      return false;
    }
    // The canvas may be one React effect ahead of `activeCvData` immediately
    // after + inserts a Languages cell. Read the grid directly before sending
    // the refill. Textarea stores each input in A4_Elements even while the cell
    // remains in edit mode, so this does not depend on focus after the click.
    const synchronizedProfile = syncGeneratedLanguagesForTemplateSwitch(
      activeCvData,
      A4_Elements,
    );
    const profileForFill = prepareStarterProfileForTemplate(synchronizedProfile);
    setFillingId(template.id);
    setError(null);
    const requestScope = captureDocumentScope();
    try {
      // Sections-panel spacing belongs to the current document layout.
      // A new template must regenerate with the generator defaults — not
      // the previous template's custom rhythm knobs.
      const res = await fillTemplate(profileForFill, template.id, {
        api,
        errorMessage: "Zmiana szablonu nie powiodła się",
        spacing: DEFAULT_FLOW_SPACING,
      });
      if (!isDocumentScopeCurrent(requestScope, { requireSameRevision: true })) {
        setError("Dokument zmienił się w trakcie generowania. Uruchom zmianę szablonu ponownie.");
        return false;
      }
      // No title argument: `replaceActiveElements` only overwrites the
      // title input when one is passed, so the project keeps whatever
      // name the user already gave it.
      // The generator receives the synchronized profile and owns the whole
      // target canvas. Cross-template element order is not stable, so copying
      // source canvas text here can place a record into an unrelated slot.
      replaceActiveElements(
        res.elements,
        undefined,
        template.id,
        { cvData: synchronizedProfile },
      );
      // Keep knobs / Reset baseline / next autosave `spacing_px` aligned
      // with the freshly generated layout (after pinFlowSpacingBaseline).
      adoptDocumentFlowSpacing?.(DEFAULT_FLOW_SPACING);
      pushToast?.({
        title: "Szablon zmieniony",
        // Template browsing is one continuous workflow. Keep its latest
        // outcome visible instead of stacking stale template confirmations.
        replaceKey: "template-change",
        templateName: template.name,
        variant: "success",
      });
      return true;
    } catch (err) {
      setError(planErrorMessage(err, "Nie udało się zmienić szablonu."));
      return false;
    } finally {
      setFillingId(null);
    }
  }, [
    A4_Elements,
    activeCvData,
    adoptDocumentFlowSpacing,
    api,
    captureDocumentScope,
    entitlements,
    isDocumentScopeCurrent,
    pushToast,
    replaceActiveElements,
  ]);

  return { applyTemplate, fillingId, error, setError };
}
