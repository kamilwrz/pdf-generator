/**
 * Post-login empty-state onboarding surface.
 *
 * Replaces the blank canvas with manual setup, PDF import and a Pro interview.
 * Interview access comes from the parent's resolved server entitlement.
 * Saved documents and legacy draft
 * recovery remain deliberately quieter secondary actions.
 *
 * Visibility is decided by `shouldShowStartChooser` (utils/startChooser.js);
 * this component assumes the caller only mounts it when that returns true.
 * It replaces the complete editor shell so tool chrome and subscription-only
 * floating actions cannot compete with the user's initial decision.
 *
 * Visual language follows DESIGN.md (Swiss/grid): sharp 0px corners, the muted
 * chrome token palette, a clear type hierarchy, an icon system (no emojis), and
 * a fade + translate-Y entry that respects `prefers-reduced-motion`.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AiOutlineLogout } from "react-icons/ai";
import { FiMessageSquare } from "react-icons/fi";
import classes from "./StartChooser.module.css";

/**
 * Pen / step-by-step glyph for the wizard path (Lucide "square-pen" shape).
 * `aria-hidden` because the card's heading already names the action.
 */
function NewCvIcon() {
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

/** Folder glyph for opening the authenticated user's saved projects. */
function DocumentsIcon() {
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
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M3 9h18" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onNew - open the one-screen A4 setup
 * @param {() => void} props.onDocuments - navigate to the standalone library
 * @param {(id: number) => void} props.onContinue - open the named saved document
 * @param {() => void} props.onImport - open the CV import dialog (AiCvPanel)
 * @param {Array<{title?: string, created_at?: string}>} [props.documents] - saved projects
 * @param {boolean} [props.documentsLoaded] - whether the saved-project list finished loading
 * @param {object|null} [props.entitlements] - current server permissions; null never grants AI access
 * @param {boolean} [props.legacyDraftNeedsOwnershipConfirmation] - label browser-local recovery as an explicit ownership confirmation
 * @param {() => void} props.onLogout - sign out the current session
 */
export default function StartChooser({
  onNew,
  onImport,
  onDocuments,
  onContinue,
  documents = [],
  documentsLoaded = false,
  entitlements = null,
  legacyDraftAvailable = false,
  legacyDraftNeedsOwnershipConfirmation = false,
  onRecoverLegacyDraft,
  onLogout,
}) {
  const titleRef = useRef(null);
  const canInterview = entitlements?.ai_assistant === true;
  const accessResolved = typeof entitlements?.ai_assistant === "boolean";
  const interviewAction = canInterview ? "Rozpocznij wywiad" : accessResolved ? "Poznaj Pro" : "Sprawdź dostęp";
  const latestDocument = [...documents]
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))[0];
  const latestDocumentDate = (latestDocument?.updated_at || latestDocument?.created_at)
    ? new Intl.DateTimeFormat("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(latestDocument.updated_at || latestDocument.created_at))
    : null;

  useEffect(() => {
    // The chooser may replace an already-focused editor control after the
    // empty-document state resolves. Moving focus to its heading makes the
    // new full-screen task boundary explicit without trapping focus like a
    // modal; the editor chrome is unmounted by PdfCanvas while this is shown.
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className={classes.overlay} aria-labelledby="start-chooser-title">
      <a href="/" className={classes.brand} aria-label="CV Studio — strona główna">
        <img src="/cv-studio-mark.svg" alt="" />
        <span>CV STUDIO</span>
      </a>
      <div className={classes.inner}>
        <header className={classes.head}>
          <h1
            ref={titleRef}
            id="start-chooser-title"
            className={classes.title}
            tabIndex={-1}
          >
            Jak chcesz zacząć?
          </h1>
          <p className={classes.subtitle}>
            Stwórz CV samodzielnie, zaimportuj dokument lub zacznij od rozmowy.
          </p>
        </header>

        <div className={classes.cards}>
          {/* Recommended path first: configure the document structure, then edit A4. */}
          <button
            type="button"
            className={`${classes.card} ${classes.cardPrimary}`}
            onClick={onNew}
          >
            <span className={classes.iconWrap} aria-hidden="true">
              <NewCvIcon />
            </span>
            <span className={classes.cardTitle}>Utwórz nowe CV</span>
            <span className={classes.cardText}>
              Wybierz szablon, kontakty i sekcje. Otrzymasz gotową strukturę
              z podpowiedziami do uzupełnienia bezpośrednio na A4.
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

          <Link
            className={`${classes.card} ${classes.cardInterview}`}
            to={canInterview ? "/app/interview" : "/app/account"}
            aria-labelledby="start-interview-title start-interview-action"
            aria-describedby="start-interview-description start-interview-access"
          >
            <span className={classes.cardTop}>
              <span className={classes.iconWrap} aria-hidden="true"><FiMessageSquare className={classes.icon} /></span>
              <span className={classes.proLabel}>{canInterview ? "W Twoim Pro" : "Dostępny w Pro"}</span>
            </span>
            <span id="start-interview-title" className={classes.cardTitle}>Wywiad</span>
            <span id="start-interview-description" className={classes.cardText}>
              Opowiedz o swoim doświadczeniu. AI dopyta o szczegóły i przygotuje treść CV z informacji, które zatwierdzisz.
            </span>
            <span id="start-interview-access" className={classes.accessNote}>
              {canInterview ? "Korzysta z Twoich kredytów AI." : accessResolved ? "W pakiecie Free wywiad jest dostępny po przejściu na Pro." : "Dostęp do wywiadu sprawdzisz na swoim koncie."}
            </span>
            <span id="start-interview-action" className={classes.ctaInterview}>{interviewAction}<span aria-hidden="true">→</span></span>
          </Link>
        </div>

        <div className={classes.secondaryActions}>
          <Link className={classes.blankLink} to="/help#wywiad">Jak działa wywiad</Link>
          <button type="button" className={classes.blankLink} onClick={onDocuments}>Wszystkie dokumenty →</button>
          {documentsLoaded && latestDocument ? (
            <button type="button" className={classes.recentDocument} onClick={() => onContinue(latestDocument.id)}>
              <span className={classes.secondaryIcon} aria-hidden="true">
                <DocumentsIcon />
              </span>
              <span className={classes.secondaryCopy}>
                <span className={classes.secondaryLabel}>Kontynuuj ostatnie CV</span>
                <span className={classes.secondaryMeta}>
                  {latestDocument.title || "Bez nazwy"}{latestDocumentDate ? ` · ${latestDocumentDate}` : ""}
                </span>
              </span>
              <span className={classes.secondaryArrow} aria-hidden="true">→</span>
            </button>
          ) : (
            <p className={classes.documentsEmpty}>
              <span className={classes.secondaryLabel}>Moje dokumenty</span>
              <span>
                {documentsLoaded ? "Nie masz jeszcze zapisanych CV." : "Sprawdzamy zapisane CV…"}
              </span>
            </p>
          )}
          {legacyDraftAvailable ? (
            <button type="button" className={classes.blankLink} onClick={onRecoverLegacyDraft}>
              {legacyDraftNeedsOwnershipConfirmation
                ? "To mój szkic — przenieś na A4 →"
                : "Przenieś stary szkic kreatora na A4 →"}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className={classes.logout}
        onClick={onLogout}
        aria-label="Wyloguj się"
        title="Wyloguj się"
      >
        <AiOutlineLogout aria-hidden="true" />
      </button>
    </section>
  );
}
