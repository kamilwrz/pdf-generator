/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: header → hero → templates → privacy → pricing → FAQ → footer.
 *
 * Two funnels, one consistent primary action ("Stwórz CV za darmo" → wizard)
 * and one secondary ("Wgraj swoje CV" → import):
 *   - Wizard → enter data → register → Free Meridian → editor
 *   - Import → register → extract data → pick template → editor (metered request)
 *
 * Only the "import" CTA still detours through registration/login, because it
 * calls the account-scoped `POST /ai/extract_cv` endpoint. Wizard and demo go straight
 * to `/cvstudio/guest?start=...` (or `/cvstudio/{username}` when already
 * authenticated). Each CTA queues a per-source funnel event so analytics can
 * tell which surface drove the click (see queueGuestEvent + events.py).
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import { wakeBackend } from "../../services/api";
import { queueGuestEvent } from "../../utils/guestEvents";
import { getAccessToken, getEditorPath } from "../../utils/authSession";
import {
    FREE_PLAN_HIGHLIGHTS,
    PRO_PLAN_HIGHLIGHTS,
} from "../../utils/planPresentation";

const TEMPLATE_PREVIEWS = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    image: `/template-mockups/${template.id}.png`,
}));

// Dynamic template count keeps the full template gallery and its accessible
// name aligned with the actual registry.
const TEMPLATE_COUNT = TEMPLATES.length;

function ArrowIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m5 12 4.2 4.2L19.5 6" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Footer social marks. Lucide-style single-colour glyphs that inherit
// `currentColor`, so they invert together with their button on hover. Purely
// decorative — the accessible name lives on the wrapping link, so each icon is
// hidden from assistive technology.
function LinkedInIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-.95 1.82-1.95 3.75-1.95C21.4 8.69 22 11 22 14.02V21h-4v-6.2c0-1.48-.03-3.38-2.06-3.38-2.06 0-2.38 1.6-2.38 3.27V21h-4V9Z" />
        </svg>
    );
}

function GithubIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.83L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05L17.08 19.77Z" />
        </svg>
    );
}

// "import" starts a metered extraction request (POST /ai/extract_cv) and stays
// behind registration because the monthly allowance and personal-data history
// belong to an account. Free receives one successful import per UTC month.
// Every other start intent is local or deterministic, so it can enter guest mode.
function buildStartUrl(start, plan) {
    if (start === "import") {
        if (getAccessToken()) return getEditorPath({ start });
        return `/register?start=${start}&plan=${plan}`;
    }
    return getEditorPath({ start });
}

/**
 * Shared landing call-to-action. `event` is the per-source funnel event fired
 * on click (queued while anonymous, flushed after auth — see events.py for the
 * fixed vocabulary). `variant` picks the primary / secondary / link chrome.
 */
function CtaLink({ to, event, variant = "primary", children }) {
    const variantClass =
        variant === "secondary"
            ? classes.buttonSecondary
            : variant === "link"
            ? classes.textCta
            : classes.buttonPrimary;
    return (
        <Link to={to} className={variantClass} onClick={() => queueGuestEvent(event)}>
            {children}
            <ArrowIcon />
        </Link>
    );
}

export default function Hero() {
    useEffect(() => {
        // Warm the optional API while visitors read the landing page. Loading
        // the marketing content never depends on the backend being available.
        wakeBackend();
    }, []);

    // Free includes one successful monthly import; Pro removes that quota and
    // adds scale, every template, and AI workflows without changing PDF quality.
    const importUrl = buildStartUrl("import", "free");
    const wizardUrl = buildStartUrl("wizard", "free");
    const demoUrl = getEditorPath({ start: "demo" });
    const proRegisterUrl = "/register?plan=pro";

    return (
        <main className={classes.page}>
            <header className={classes.header}>
                <a className={classes.brand} href="#top" aria-label="CV Studio — strona główna">
                    <img src="/cv-studio-logo.svg" alt="" />
                </a>
                <nav className={classes.navigation} aria-label="Główna nawigacja">
                    <a href="#szablony">Szablony</a>
                    <a href="#cennik">Cennik</a>
                    <Link to="/login">Zaloguj się</Link>
                    <Link
                        className={classes.navStart}
                        to={wizardUrl}
                        onClick={() => queueGuestEvent("hero_wizard")}
                    >
                        Stwórz CV
                    </Link>
                </nav>
            </header>

            <section id="top" className={classes.hero}>
                <div className={classes.heroMedia} aria-hidden="true">
                    <img src="/women-job-call.png" alt="" />
                </div>
                <div className={classes.heroCopy}>
                    <p className={classes.kicker} data-section-index="01">CV gotowe na konkretną rekrutację</p>
                    <h1>
                        <span>Stwórz CV,</span>
                        <em>które prowadzi</em>
                        <em>do rozmowy.</em>
                    </h1>
                    <p className={classes.heroLead}>
                        Wgraj stare CV lub zacznij od zera. CV Studio pomoże Ci dopasować
                        treść do oferty i ułoży ją w profesjonalny dokument gotowy do
                        wysłania.
                    </p>
                    <div className={classes.heroActions}>
                        <CtaLink to={wizardUrl} event="hero_wizard">Stwórz CV za darmo</CtaLink>
                        <CtaLink to={importUrl} event="hero_import" variant="secondary">
                            Wgraj swoje CV
                        </CtaLink>
                    </div>
                    <p className={classes.heroTertiary}>
                        <Link to={demoUrl} onClick={() => queueGuestEvent("hero_demo")}>
                            Najpierw zobacz przykładowe CV <ArrowIcon />
                        </Link>
                    </p>
                    <ul className={classes.heroTrust} aria-label="Korzyści na start">
                        <li>ZA DARMO</li>
                        <li>CZYSTY PDF</li>
                        <li>INTELIGENTNY LAYOUT</li>
                    </ul>
                </div>

            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.templatesHeader}>
                    <div>
                        <p className={classes.kicker} data-section-index="05">Szablony, nie klatki</p>
                        <h2>Zmieniasz charakter dokumentu.<br /><em>Nie zaczynasz od nowa.</em></h2>
                    </div>
                    <p>
                        Klasyczny, editorial, techniczny, z sidebarem albo bez. Szablon
                        odpowiada za język wizualny dokumentu — Twoja treść pozostaje
                        niezależna od jego wyglądu. Możesz zmienić szablon także później,
                        kiedy CV jest już napisane i poprawione.
                        <span className={classes.templateCategories}>Classic · Executive · Editorial · Sidebar · Modern · Tech</span>
                    </p>
                </div>
                {/*
                  Endless right→left marquee of every template mockup. The track
                  is duplicated so translateX(-50%) loops without a seam. Hover
                  (or keyboard focus) pauses the animation and scales the card.
                */}
                <div
                    className={classes.templateMarquee}
                    aria-label={`Galeria ${TEMPLATE_COUNT} szablonów CV`}
                    style={{
                        // ~3.2s per card keeps the strip readable as the registry grows.
                        ["--marquee-duration"]: `${Math.max(36, TEMPLATE_COUNT * 3.2)}s`,
                    }}
                >
                    <div className={classes.templateMarqueeTrack}>
                        {[0, 1].map((copy) => (
                            <div
                                key={copy}
                                className={classes.templateMarqueeGroup}
                                aria-hidden={copy === 1 ? true : undefined}
                            >
                                {TEMPLATE_PREVIEWS.map((template) => (
                                    <Link
                                        key={`${copy}-${template.id}`}
                                        to={wizardUrl}
                                        className={classes.templateCard}
                                        tabIndex={copy === 1 ? -1 : undefined}
                                        onClick={() => queueGuestEvent("templates_wizard")}
                                    >
                                        <img
                                            src={template.image}
                                            alt={copy === 0 ? `Szablon CV ${template.name}` : ""}
                                            loading="lazy"
                                        />
                                        <span>
                                            <b>{template.name}</b>
                                            <small>{template.description}</small>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <CtaLink to={wizardUrl} event="templates_wizard" variant="link">
                    Zobacz, jak Twoja treść może wyglądać
                </CtaLink>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker} data-section-index="09">CV to prywatny dokument</p>
                    <h2>Twoje dokumenty nie są publiczne.</h2>
                    <p>
                        Dostęp do zapisanych CV i zdjęć jest przypisany do konta, a historia
                        importu przechowuje ustrukturyzowane dane zamiast kopii oryginalnego PDF.
                    </p>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />Dokumenty i zdjęcia przypisane do konta</li>
                    <li><CheckIcon />Historia importu bez kopii źródłowego PDF</li>
                    <li><CheckIcon /><a href="#privacy">Szczegóły w Polityce prywatności</a></li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker} data-section-index="10">Cennik</p>
                    <h2>Gotowe CV za 0 zł.<br /><em>Pro, gdy potrzebujesz więcej wersji.</em></h2>
                    <p>
                        Plan Darmowy wystarcza, by stworzyć jedno kompletne CV i pobrać czysty PDF.
                        Pro daje więcej projektów, wszystkie szablony oraz narzędzia AI i ATS.
                    </p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Darmowy</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Jedno kompletne CV, gotowe do wysłania.</p>
                        <ul>
                            {FREE_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <CtaLink to={wizardUrl} event="pricing_free" variant="secondary">
                            Zacznij za darmo
                        </CtaLink>
                        <p className={classes.planFootnote}>Bez karty · Bez limitu czasu</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Dla aktywnego szukania pracy</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>zł</small></p>
                        <p className={classes.planSummary}>Więcej wersji CV i szybsze dopracowanie.</p>
                        <p className={classes.planPeriod}>30 dni pełnego dostępu</p>
                        <ul>
                            {PRO_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <Link
                            className={classes.buttonPrimary}
                            to={proRegisterUrl}
                            onClick={() => queueGuestEvent("pricing_pro")}
                        >
                            Przejdź na Pro <ArrowIcon />
                        </Link>
                        <p className={classes.planFootnote}>Jedna płatność · Bez subskrypcji · Bez automatycznego odnowienia</p>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker} data-section-index="11">FAQ</p>
                    <h2>Najczęstsze pytania</h2>
                </div>
                <div className={classes.faqList}>
                    <details open>
                        <summary>Czy mogę najpierw zobaczyć, jak działa CV Studio?</summary>
                        <p>Tak. Możesz otworzyć przykładowe CV i sprawdzić edycję bez zakładania konta. Konto jest potrzebne później do zapisu i eksportu dokumentu.</p>
                    </details>
                    <details>
                        <summary>Mam już gotowe CV. Czy naprawdę muszę wpisywać wszystko od nowa?</summary>
                        <p>Nie. Możesz wgrać PDF i wykorzystać jego treść jako punkt wyjścia. CV Studio odczyta dane i ułoży je w edytowalnej strukturze. Plan Darmowy obejmuje 1 udany import CV w każdym miesiącu.</p>
                    </details>
                    <details>
                        <summary>Co dokładnie obejmuje plan Darmowy?</summary>
                        <p>Możesz zapisać 1 projekt CV, używać 3 profesjonalnych szablonów z 6 wersjami wyglądu każdy, edytować czcionki, typografię, odstępy i sekcje oraz pobrać 3 czyste PDF-y miesięcznie. Plan nie wymaga karty, nie wygasa i nie obejmuje funkcji AI.</p>
                    </details>
                    <details>
                        <summary>Co stanie się z moimi poprawkami, jeśli później zmienię szablon?</summary>
                        <p>Treść CV pozostaje zapisana niezależnie od jego wyglądu. Możesz więc poprawić opis doświadczenia, a później zmienić szablon bez wracania do wcześniejszej wersji tekstu.</p>
                    </details>
                    <details>
                        <summary>Czy CV Studio będzie na siłę wciskać wszystko na jedną stronę?</summary>
                        <p>Nie. Jedna strona nie zawsze jest lepsza. CV Studio najpierw szuka rozsądnego układu i pilnuje czytelności dokumentu. Jeśli treści jest za dużo, CV może pozostać dwu- lub wielostronicowe.</p>
                    </details>
                    <details>
                        <summary>Czy mogę sprawdzić, czy moje CV jest czytelne dla ATS?</summary>
                        <p>Tak, w planie Pro. CV Studio może sprawdzić, czy tekst PDF jest możliwy do odczytania oraz czy dokument używa czytelnej struktury i typowych nagłówków. Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym.</p>
                    </details>
                    <details>
                        <summary>Czy pobrany PDF naprawdę będzie wyglądał tak samo jak w edytorze?</summary>
                        <p>Tak — również w planie Darmowym. Edytor pracuje na rzeczywistym formacie A4, a czysty PDF korzysta z tej samej geometrii dokumentu.</p>
                    </details>
                    <details>
                        <summary>Czy Pro to subskrypcja?</summary>
                        <p>Nie. Pro kosztuje 59 zł i daje 30 dni dostępu. Płatność nie odnawia się automatycznie.</p>
                    </details>
                </div>
            </section>

            <footer className={classes.footer}>
                <div className={classes.footerTop}>
                    <div>
                        <a className={classes.brand} href="#top" aria-label="CV Studio — strona główna">
                            <img src="/cv-studio-logo.svg" alt="" />
                        </a>
                        <p className={classes.footerTagline}>
                            Treść jest Twoja. Dokument nie musi być problemem.
                        </p>
                        {/* Social destinations are placeholders until the public
                            profiles exist; each link carries an accessible name so
                            the icon-only buttons stay usable. */}
                        <div className={classes.footerSocial}>
                            <a href="#" aria-label="CV Studio na LinkedIn"><LinkedInIcon /></a>
                            <a href="#" aria-label="CV Studio na GitHub"><GithubIcon /></a>
                            <a href="#" aria-label="CV Studio na X"><XIcon /></a>
                        </div>
                    </div>
                    <nav className={classes.footerNav} aria-label="Stopka">
                        <div className={classes.footerCol}>
                            <p className={classes.footerColTitle}>Produkt</p>
                            <a href="#szablony">Szablony</a>
                            <a href="#cennik">Cennik</a>
                        </div>
                        <div className={classes.footerCol}>
                            <p className={classes.footerColTitle}>Konto</p>
                            <Link to="/login">Zaloguj się</Link>
                            <Link to={wizardUrl}>Stwórz CV</Link>
                        </div>
                        <div className={classes.footerCol}>
                            <p className={classes.footerColTitle}>Informacje</p>
                            <a href="#privacy">Prywatność</a>
                            <a href="#">Regulamin</a>
                            <a href="#">Kontakt</a>
                        </div>
                    </nav>
                </div>
                <div className={classes.footerBottom}>
                    <small>© 2026 CV Studio</small>
                    <small className={classes.footerSeo}>
                        Kreator CV · Szablony CV · Edytor CV online · Eksport PDF
                    </small>
                </div>
            </footer>
        </main>
    );
}
