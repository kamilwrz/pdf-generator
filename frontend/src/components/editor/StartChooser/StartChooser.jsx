/**
 * Post-login empty-state onboarding surface.
 *
 * Replaces the blank freeform A4 a user would otherwise land on with a clear
 * two-path chooser: the guided step-by-step wizard (`BioCvModal`) or importing
 * an existing CV PDF (`AiCvPanel`). Both actions call the same context handlers
 * the Topbar already uses, so this component owns no flow logic of its own — it
 * is purely the entry-point UI. A tertiary link lets power users skip straight
 * into freeform editing.
 *
 * Visibility is decided by `shouldShowStartChooser` (utils/startChooser.js);
 * this component assumes the caller only mounts it when that returns true.
 *
 * Visual language follows DESIGN.md (Swiss/grid): sharp 0px corners, the muted
 * chrome token palette, a clear type hierarchy, an icon system (no emojis), and
 * a fade + translate-Y entry that respects `prefers-reduced-motion`.
 */
import classes from "./StartChooser.module.css";

/**
 * Pen / step-by-step glyph for the wizard path (Lucide "square-pen" shape).
 * `aria-hidden` because the card's heading already names the action.
 */
function WizardIcon() {
  return (
    <svg
      className={classes.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** Upload glyph for the import path (Lucide "upload" shape). */
function ImportIcon() {
  return (
    <svg
      className={classes.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onWizard - open the step-by-step wizard (BioCvModal)
 * @param {() => void} props.onImport - open the CV import dialog (AiCvPanel)
 * @param {() => void} props.onBlank  - dismiss into a blank freeform canvas
 */
export default function StartChooser({ onWizard, onImport, onBlank }) {
  return (
    <div className={classes.overlay} role="region" aria-label="Zacznij nowe CV">
      <div className={classes.inner}>
        <header className={classes.head}>
          <h1 className={classes.title}>Jak chcesz zacząć?</h1>
          <p className={classes.subtitle}>
            Wybierz kreator albo zaimportuj gotowe CV — resztą zajmiemy się my.
          </p>
        </header>

        <div className={classes.cards}>
          {/* Recommended path first: the guided wizard needs no existing CV. */}
          <button
            type="button"
            className={`${classes.card} ${classes.cardPrimary}`}
            onClick={onWizard}
          >
            <span className={classes.iconWrap} aria-hidden="true">
              <WizardIcon />
            </span>
            <span className={classes.cardTitle}>Stwórz CV w kreatorze</span>
            <span className={classes.cardText}>
              Odpowiadasz na kilka pytań krok po kroku, a my składamy z nich
              gotowe CV w wybranym szablonie.
            </span>
            <span className={classes.cta}>Zacznij</span>
          </button>

          <button
            type="button"
            className={`${classes.card} ${classes.cardSecondary}`}
            onClick={onImport}
          >
            <span className={classes.iconWrap} aria-hidden="true">
              <ImportIcon />
            </span>
            <span className={classes.cardTitle}>Zaimportuj istniejące CV</span>
            <span className={classes.cardText}>
              Wgraj CV w formacie PDF — przepiszemy dane do wybranego szablonu,
              gotowego do edycji.
            </span>
            <span className={classes.ctaGhost}>Wgraj CV</span>
          </button>
        </div>

        <button type="button" className={classes.blankLink} onClick={onBlank}>
          albo zacznij od pustej strony
        </button>
      </div>
    </div>
  );
}
