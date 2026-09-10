/**
 * Canonical Polish plan copy shared by public pricing and the in-app picker.
 *
 * Billing remains authoritative for prices and entitlements. This module owns
 * only presentation, so a temporarily stale plan-catalog response cannot bring
 * back obsolete limits or imply that Free exports have reduced output quality.
 */

export const FREE_PLAN_HIGHLIGHTS = Object.freeze([
    "1 zapisany projekt CV",
    "1 udany import CV miesięcznie",
    "3 szablony · każdy w 6 wersjach wyglądu",
    "Edycja czcionek, wielkości tekstu, odstępów i sekcji",
    "3 pobrania PDF miesięcznie, bez znaku wodnego",
    "Samodzielna edycja bez funkcji AI",
]);

export const PRO_PLAN_HIGHLIGHTS = Object.freeze([
    "Wywiad AI: opisz doświadczenie i przygotuj CV pod ofertę",
    "Profil zawodowy z informacjami do kolejnych CV",
    "Wszystkie szablony i warianty wyglądu",
    "Nielimitowane projekty, importy i pobrania PDF",
    "AI do poprawek tekstu, analizy ATS i układu",
    "200 kredytów na wywiad i pozostałe funkcje AI",
]);

export const PLAN_PRESENTATION = Object.freeze({
    free: Object.freeze({
        slug: "free",
        name: "Darmowy",
        price_pln: 0,
        price_label: "0 zł",
        blurb: "Jedno CV ze wszystkimi narzędziami do samodzielnej edycji.",
        highlights: FREE_PLAN_HIGHLIGHTS,
        period_note: "Bez karty · Bez limitu czasu",
        cta: "Stwórz CV za darmo",
    }),
    pro: Object.freeze({
        slug: "pro",
        name: "Pro",
        price_pln: 59,
        price_label: "59 zł / 30 dni",
        blurb: "Od rozmowy o doświadczeniu do CV pod ofertę.",
        highlights: PRO_PLAN_HIGHLIGHTS,
        period_note: "Jedna płatność · Bez automatycznego odnawiania",
        badge: "Dla wielu wersji CV i pracy z AI",
        cta: "Odblokuj Pro",
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
