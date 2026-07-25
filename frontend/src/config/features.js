// Build-time feature flags. Flip a value and redeploy to change behavior —
// not an env var, not a per-user DB toggle.
export const FEATURES = {
    // Deck (Slajdy AI) and article (Artykuł AI) generation are hidden from
    // the UI as of the CV-only positioning decision (docs/designs/
    // cv-only-ux-monetization.md). The underlying components, templates, and
    // backend generators are untouched — flip this back to true to restore
    // the entry points without any other code changes.
    decksArticles: false,
};
