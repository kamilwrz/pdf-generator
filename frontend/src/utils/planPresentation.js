import { t as uiText } from "../i18n/index.js";
import { localisedList } from "../i18n/index.js";
/**
 * Canonical localised plan copy shared by public pricing and the in-app picker.
 *
 * Billing remains authoritative for prices and entitlements. This module owns
 * only presentation, so a temporarily stale plan-catalog response cannot bring
 * back obsolete limits or imply that Free exports have reduced output quality.
 */

export const FREE_PLAN_HIGHLIGHTS = Object.freeze(localisedList([
    () => uiText("editor:planPresentation.savedProject"),
    () => uiText("editor:planPresentation.successfulPdfImportPerMonth"),
    () => uiText("editor:planPresentation.templatesEachWithAppearanceVariations"),
    () => uiText("editor:planPresentation.manualChangesToFontsSpacingAndSections"),
    () => uiText("editor:planPresentation.pdfDownloadsPerMonthWithoutAWatermark"),
    () => uiText("editor:planPresentation.manualEditing"),
]));

export const PRO_PLAN_HIGHLIGHTS = Object.freeze(localisedList([
    () => uiText("editor:planPresentation.aiInterviewsToCollectExperienceAndPrepare"),
    () => uiText("editor:planPresentation.careerProfile"),
    () => uiText("editor:planPresentation.allTemplatesAndAppearanceVariations"),
    () => uiText("editor:planPresentation.unlimitedDocuments"),
    () => uiText("editor:planPresentation.aiForTextEditingAtsAnalysisAnd"),
    () => uiText("editor:planPresentation.creditsForInterviewsAndOtherAiFeatures"),
]));

export const PLAN_PRESENTATION = Object.freeze({
    free: Object.freeze({
        slug: "free",
        get name() { return uiText("public:hero.free"); },
        price_pln: 0,
        get price_label() { return uiText("editor:planPresentation.pln"); },
        get blurb() { return uiText("editor:planPresentation.oneCvAndAllManualEditingOptions"); },
        highlights: FREE_PLAN_HIGHLIGHTS,
        get period_note() { return uiText("public:hero.noCardRequiredThePlanHasNo"); },
        get cta() { return uiText("public:hero.createACvForFree"); },
    }),
    pro: Object.freeze({
        slug: "pro",
        name: "Pro",
        price_pln: 59,
        get price_label() { return uiText("editor:planPresentation.plnDays"); },
        get blurb() { return uiText("editor:planPresentation.anInterviewAboutYourExperienceAndSeparate"); },
        highlights: PRO_PLAN_HIGHLIGHTS,
        get period_note() { return uiText("public:hero.oneOffPaymentNoAutomaticRenewal"); },
        get badge() { return uiText("editor:planPresentation.forMultipleCvVersionsAndAiAssisted"); },
        get cta() { return uiText("editor:planPresentation.choosePro"); },
    }),
});

/**
 * Merge backend-owned commercial data with the current product copy.
 *
 * @param {object} plan - Catalog item returned by the billing API.
 * @returns {object} A display-ready plan with canonical user-facing limits.
 */
export function applyPlanPresentation(plan) {
    const presentation = PLAN_PRESENTATION[plan?.slug];
    if (!presentation) return plan;
    const merged = Object.defineProperties({ ...plan }, Object.getOwnPropertyDescriptors(presentation));
    return Object.defineProperties({}, {
        ...Object.getOwnPropertyDescriptors(merged),
        price_pln: { enumerable: true, value: plan?.price_pln ?? presentation.price_pln },
    });
}

/** Fallback catalog used while billing is loading or temporarily unavailable. */
export const FALLBACK_PLAN_CATALOG = Object.freeze([
    applyPlanPresentation({ slug: "free" }),
    applyPlanPresentation({ slug: "pro" }),
]);
