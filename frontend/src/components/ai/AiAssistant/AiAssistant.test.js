import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI correction handlers allow empty content only for shortening", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /function withoutEmptyContentReplacement\(fields, allowEmptyContent = false\)/);
    assert.match(source, /String\(fields\.content \?\? ""\)\.trim\(\)/);
    assert.match(source, /const safeFields = withoutEmptyContentReplacement\(/);
    assert.match(source, /actionId === "shorten"/);
    assert.match(source, /if \(Object\.keys\(safeFields\)\.length === 0\)/);
});

test("layout mode waits for the user's message before sending a request", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /setMessages\(prev => \[\.\.\.prev, \{\s*id: nanoid\(\),\s*role: "assistant",\s*text: LAYOUT_MODE_GREETING/s);
    assert.match(source, /layoutSuggestions:\s*PRIMARY_LAYOUT_SUGGESTIONS/);
    assert.match(source, /layoutSuggestionsMore:\s*SECONDARY_LAYOUT_SUGGESTIONS/);
    assert.match(source, /send\(layoutMode \? "layout" : "chat", text\)/);

    // Enabling the toggle must stay local. Suggestion chips may call send later.
    const toggleFn = source.match(/const toggleLayoutMode = useCallback\(\(\) => \{([\s\S]*?)\}, \[entitlements/);
    assert.ok(toggleFn, "expected a local layout toggle callback");
    assert.doesNotMatch(toggleFn[1], /\bsend\s*\(/);
});

test("layout suggestions expose short labels and fuller GPT prompts", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const LAYOUT_SUGGESTIONS = \[/);
    assert.match(source, /handleLayoutSuggestion/);
    assert.match(source, /send\("layout", suggestion\.prompt, \{ displayText: suggestion\.label \}\)/);
    assert.match(source, /displayText: options\.displayText/);
    assert.match(source, /const visibleText = msg\.displayText \|\| msg\.text/);

    const block = source.match(/const LAYOUT_SUGGESTIONS = \[([\s\S]*?)\];/)?.[1] || "";
    const ids = [...block.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 10);
    assert.ok(ids.includes("header-gaps"));
    assert.ok(ids.includes("full-rhythm"));
    assert.match(block, /layout_contract/);
    assert.match(block, /real_gap/);

    const primaryCount = [...block.matchAll(/primary:\s*true/g)].length;
    assert.equal(primaryCount, 4);
});

test("assistant send blocks parallel requests before isLoading re-renders", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /requestInFlightRef/);
    assert.match(source, /if \(requestInFlightRef\.current \|\| isLoading\) return/);
    assert.match(source, /requestInFlightRef\.current = true/);
    assert.match(source, /requestInFlightRef\.current = false/);
});

test("assistant chat resets when the document session changes", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /chatSessionRef/);
    assert.match(source, /sessionKey/);
    assert.match(source, /useDocumentLifecycle/);
    assert.match(source, /chatSessionRef\.current \+= 1/);
    assert.match(source, /setMessages\(\[\]\)/);
    assert.match(source, /setLayoutMode\(false\)/);
    // PdfCanvas preview useMemo reads `.length` — clear with [] not null.
    assert.match(source, /setLayoutPreviewPatches\?\.\(\[\]\)/);
    assert.match(source, /setDeletionPreviewIds\?\.\(\[\]\)/);
    assert.doesNotMatch(source, /setLayoutPreviewPatches\?\.\(null\)/);
    assert.doesNotMatch(source, /setDeletionPreviewIds\?\.\(null\)/);
    assert.match(source, /const sessionAtStart = chatSessionRef\.current/);
    assert.match(source, /isDocumentScopeCurrent\(documentScope, \{ requireSameRevision: true \}\)/);
});

test("assistant retries share one idempotency key per logical send", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const idempotencyKey = globalThis\.crypto\?\.randomUUID\?\.\(\) \|\| nanoid\(\)/);
    assert.match(source, /"Idempotency-Key": idempotencyKey/);
    assert.match(source, /const operationApi = new ApiClient/);
    assert.match(source, /operationApi\.httpRequest\(/);
});

test("assistant messages retain the document revision that produced them", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    const sourceRevisionAssignments = source.match(/sourceRevision: documentScope\.revision/g) || [];
    assert.ok(
        sourceRevisionAssignments.length >= 3,
        "user, success, and error messages must retain their source revision",
    );
    assert.match(source, /sourceSessionKey: String\(documentScope\.epoch\)/);
});

test("apply all preserves rejected job-tailoring profile changes", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /acceptedIds\.length > 0[\s\S]*message\?\.updatedCvData[\s\S]*message\.actionId !== "position_rating"/);
});

test("goal-oriented quick actions replace flat feature tiles", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const GOAL_ACTIONS = \[/);
    assert.match(source, /id: "check_cv"/);
    assert.match(source, /id: "improve_content"/);
    assert.match(source, /id: "match_job"/);
    assert.match(source, /id: "check_appearance"/);
    assert.match(source, /id: "translate"/);
    assert.match(source, /CONTENT_SUBACTIONS/);
    assert.match(source, /APPEARANCE_SUBACTIONS/);
    assert.match(source, /TRANSLATE_LANGUAGES/);
    assert.match(source, /function RatingDashboard/);
    assert.match(source, /target_language/);
    assert.match(source, /send\("rating"/);
    assert.match(source, /send\("ats_score"/);

    // Flat feature-centric tiles should no longer be the primary menu.
    assert.doesNotMatch(source, /label: "Oceń CV"/);
    assert.doesNotMatch(source, /label: "Wynik ATS"/);
});

test("ATS dashboard uses readability copy, verbal band, and disclaimer", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /ats_score:\s*\{\s*label:\s*"Czytelność dla ATS"/);
    assert.match(source, /overallPercentFromCategories/);
    assert.match(source, /overallPercentFromRubric/);
    assert.match(source, /ATS_CATEGORY_WEIGHTS/);
    assert.match(source, /from "\.\.\/\.\.\/\.\.\/utils\/atsScore"/);
    assert.match(source, /isAts \? "Czytelność dla ATS" : "Ocena ogólna"/);
    assert.match(source, /overallPercentFromRubric\(categories\)/);
    assert.match(source, /atsDisclaimer/);
    assert.match(
        source,
        /Ocena sprawdza strukturę i czytelność dokumentu\. Różne systemy ATS mogą/,
    );
    assert.doesNotMatch(source, /Przyjazność ATS/);
});

test("assistant threads a cv_language override into the request body", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    // send() must forward an optional cv_language for content actions.
    assert.match(source, /const cvLanguageOverride = options\.cv_language \|\| cvLanguage/);
    assert.match(source, /\.\.\.\(cvLanguageOverride[\s\S]*?cv_language: cvLanguageOverride/);
});

test("translation sends the canonical profile and receives the replacement profile", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    // Omitting `translate` here routes translation through the legacy
    // element-only path, which recreates Polish profile text on template swap.
    assert.match(
        source,
        /const contentActions = \["grammar", "language", "improve", "shorten", "translate", "position_rating"\]/,
    );
    assert.match(source, /\.\.\.\(contentActions\.includes\(action\) && activeCvData/);
    assert.match(source, /updatedCvData: res\.updated_cv_data \?\? null/);
});

test("job tailoring sends URL, fallback, notes and the canonical profile", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /job_offer_url: action === "position_rating" \? jobOfferUrl : ""/);
    assert.match(source, /job_description: action === "position_rating" \? jobDesc : ""/);
    assert.match(source, /candidate_notes: action === "position_rating" \? candidateNotes : ""/);
    assert.match(source, /jobRequirements: res\.job_requirements \?\? \[\]/);
    assert.match(source, /evidenceGaps: res\.evidence_gaps \?\? \[\]/);
    assert.match(source, /Sprawdź czytelność ATS/);
});

test("assistant tracks the detected cv_language from responses", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const \[cvLanguage, setCvLanguage\] = useState\(""\)/);
    // Detected language from the backend syncs the selector default.
    assert.match(source, /res\.cv_language[\s\S]*?setCvLanguage/);
});

test("assistant exposes a CV language selector using the shared language list", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /handleCvLanguageChange/);
    // Selector is built from the same TRANSLATE_LANGUAGES source of truth.
    assert.match(source, /TRANSLATE_LANGUAGES\.map/);
});
