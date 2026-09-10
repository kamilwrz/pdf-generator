/**
 * Canonical Polish plan copy shared by public pricing and the in-app picker.
 *
 * Billing remains authoritative for prices and entitlements. This module owns
 * only presentation, so a temporarily stale plan-catalog response cannot bring
 * back obsolete limits or imply that Free exports have reduced output quality.
 */

export const FREE_PLAN_HIGHLIGHTS = Object.freeze([
    "1 zapisany projekt CV",
    "1 udany import PDF miesięcznie",
    "3 szablony, każdy w 6 wersjach wyglądu",
    "Samodzielna zmiana czcionek, odstępów i sekcji",
    "3 pobrania PDF miesięcznie, bez znaku wodnego",
    "Edycja bez funkcji AI",
]);

export const PRO_PLAN_HIGHLIGHTS = Object.freeze([
    "Wywiad AI do zebrania doświadczenia i przygotowania CV pod ofertę",
    "Profil zawodowy do wykorzystania w kolejnych CV",
    "Wszystkie szablony i warianty wyglądu",
    "Nielimitowane projekty, importy i pobrania PDF",
    "AI do poprawiania tekstu, analizy ATS i układu",
    "200 kredytów na wywiad i pozostałe funkcje AI",
]);

export const PLAN_PRESENTATION = Object.freeze({
    free: Object.freeze({
        slug: "free",
        name: "Darmowy",
        price_pln: 0,
        price_label: "0 zł",
        blurb: "Jedno CV i wszystkie opcje samodzielnej edycji.",
        highlights: FREE_PLAN_HIGHLIGHTS,
        period_note: "Nie potrzebujesz karty, plan nie ma limitu czasu.",
        cta: "Stwórz CV za darmo",
    }),
    pro: Object.freeze({
        slug: "pro",
        name: "Pro",
        price_pln: 59,
        price_label: "59 zł / 30 dni",
        blurb: "Wywiad o Twoim doświadczeniu i osobne CV pod konkretne oferty.",
        highlights: PRO_PLAN_HIGHLIGHTS,
        period_note: "Płatność jednorazowa, bez automatycznego odnowienia.",
        badge: "Dla kilku wersji CV i pracy z AI",
        cta: "Wybierz Pro",
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
    return {
        ...plan,
        ...presentation,
        price_pln: plan?.price_pln ?? presentation.price_pln,
        price_label: plan?.price_label ?? presentation.price_label,
    };
}

/** Fallback catalog used while billing is loading or temporarily unavailable. */
export const FALLBACK_PLAN_CATALOG = Object.freeze([
    applyPlanPresentation({ slug: "free" }),
    applyPlanPresentation({ slug: "pro" }),
]);
