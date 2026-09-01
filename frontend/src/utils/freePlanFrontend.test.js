import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
    return readFile(new URL(relativePath, root), "utf8");
}

test("landing labels, pricing, and FAQ keep the Free limits explicit", async () => {
    const hero = await source("pages/Hero/Hero.jsx");
    const pricingStart = hero.indexOf('<section id="cennik"');
    const faqStart = hero.indexOf('<section className={classes.faqSection}', pricingStart);
    const faqEnd = hero.indexOf("</section>", faqStart);
    const planMarkup = hero.slice(pricingStart, faqEnd);

    assert.ok(pricingStart >= 0 && faqStart > pricingStart && faqEnd > faqStart);
    assert.match(planMarkup, /FREE_PLAN_HIGHLIGHTS\.map/);
    assert.match(planMarkup, /PRO_PLAN_HIGHLIGHTS\.map/);
    assert.match(planMarkup, /Gotowe CV za 0 zł/);
    assert.doesNotMatch(planMarkup, /POMOC AI/);
    assert.match(planMarkup, /1 udany import CV w każdym miesiącu/);
    assert.match(planMarkup, /3 profesjonalnych szablonów z 6 wersjami wyglądu każdy/);
    assert.match(planMarkup, /nie wygasa i nie obejmuje funkcji AI/);
    assert.match(planMarkup, /Tak, w planie Pro/);
    assert.doesNotMatch(planMarkup, /znak wodny|oznaczeni(?:e|a) CV Studio|3 importy CV/i);
});

test("plan modal keeps loading, fallback, current, and pending states explicit", async () => {
    const modal = await source("components/modals/PlanSelectModal/PlanSelectModal.jsx");

    assert.match(modal, /applyPlanPresentation/);
    assert.match(modal, /FALLBACK_PLAN_CATALOG/);
    assert.match(modal, /catalogState === "loading"/);
    assert.match(modal, /catalogState === "fallback"/);
    assert.match(modal, /role="status" aria-live="polite"/);
    assert.match(modal, /aria-busy=\{busy\}/);
    assert.match(modal, /Aktualny/);
});

test("registration, import, and account gates communicate the real Free limits", async () => {
    const [register, importPanel, saveGate, sidebar] = await Promise.all([
        source("pages/Register/Register.jsx"),
        source("components/ai/AiCvPanel/AiCvPanel.jsx"),
        source("components/editor/SaveGateModal/SaveGateModal.jsx"),
        source("components/editor/Sidebar/Sidebar.jsx"),
    ]);

    assert.match(register, /1 CV, 3 szablony i 3 czyste PDF-y miesięcznie/);
    assert.match(register, /Bez karty i limitu czasu/);
    assert.match(register, /PLAN_PRESENTATION/);
    assert.match(register, /role="tablist" aria-label="Wybierz plan konta"/);
    assert.match(register, /role="tab"/);
    assert.match(register, /role="tabpanel"/);
    assert.match(register, /selectedPlan\.highlights\.map/);
    assert.match(register, /ArrowRight/);
    assert.match(register, /ArrowLeft/);
    assert.match(register, /JSON\.stringify\(\{ username, email, password, plan: selectedPlanSlug \}\)/);
    assert.match(importPanel, /1 udany import CV miesięcznie/);
    assert.match(importPanel, /odczytamy dane i wypełnimy nimi wybrany szablon/);
    assert.doesNotMatch(importPanel, /AI wypełni dowolny szablon/);
    assert.match(saveGate, /zapisać 1 CV i pobrać do 3 czystych PDF-ów miesięcznie/);
    assert.match(sidebar, /Pobrania PDF:/);
    assert.match(sidebar, /Projekty CV:/);
    assert.match(sidebar, /Importy CV:/);
    assert.match(sidebar, /monthly_ai_credits > 0/);
});

test("wizard conversions use the correct Free starter while saved documents stay template-owned", async () => {
    const [templates, wizard, canvas] = await Promise.all([
        source("utils/onboardingTemplates.js"),
        source("components/ai/BioCvModal/BioCvModal.jsx"),
        source("pages/PdfCanvas.jsx"),
    ]);

    assert.match(templates, /FREE_WIZARD_TEMPLATE_ID = "meridian"/);
    assert.match(wizard, /onboardingTemplateId = isDemoConversion \? "linden" : FREE_WIZARD_TEMPLATE_ID/);
    assert.match(wizard, /fillTemplate\(payload, onboardingTemplateId/);
    assert.match(
        wizard,
        /loadAiElements\(\s*response\.elements,\s*"Moje CV",\s*onboardingTemplateId,\s*\{ cvData: payload \},\s*\)/,
    );
    assert.match(wizard, /selectedTemplateId: onboardingTemplateId/);
    assert.match(wizard, /Linden zostanie wygenerowany/);
    assert.match(wizard, /Meridian zostanie wygenerowany/);
    assert.match(canvas, /: FREE_WIZARD_TEMPLATE_ID/);
    assert.match(canvas, /commitDocumentSnapshot\(\{\s*\.\.\.guestDoc,/);
    assert.match(canvas, /normalizeSterlingFamilyPersistence\(guestDoc\.elements, guestDoc\.templateId\)/);
    assert.doesNotMatch(wizard, /selectedTemplateId: "regent"/);
});

test("render-on-demand proves legacy paid-template ownership with the saved PDF id", async () => {
    const [exportHook, canvas] = await Promise.all([
        source("hooks/usePdfExport.js"),
        source("pages/PdfCanvas.jsx"),
    ]);

    assert.match(exportHook, /pdf_id = Number\.isInteger\(meta\.pdfId\)/);
    assert.match(exportHook, /pdf_id,/);
    assert.match(canvas, /pdfId,/);
});
