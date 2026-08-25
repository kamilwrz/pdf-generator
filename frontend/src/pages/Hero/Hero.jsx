/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: header → hero → before/after → how it works → document engine →
 * templates → editor → WYSIWYG → AI → privacy → pricing → FAQ → final CTA.
 *
 * Two funnels, one consistent primary action ("Stwórz CV za darmo" → wizard)
 * and one secondary ("Mam już CV — wgraj PDF" → import):
 *   - Wizard → enter data → pick template → editor (frontend-only, guest mode)
 *   - Import → extract data → pick template → editor (paid OpenAI extract)
 *
 * Only the "import" CTA still detours through registration/login, because it
 * calls the paid `POST /ai/extract_cv` endpoint. Wizard and demo go straight
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

const TEMPLATE_PREVIEWS = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    image: `/template-mockups/${template.id}.png`,
}));

// Dynamic template count so pricing/marketing copy never drifts from the
// actual registry (landing kicker / hero chip read TEMPLATES.length).
const TEMPLATE_COUNT = TEMPLATES.length;

const previewById = (id) => TEMPLATE_PREVIEWS.find((template) => template.id === id);

const HOW_IT_WORKS = [
    {
        number: "01",
        title: "Zbierz treść",
        text: "Odpowiedz na kilka pytań albo zacznij od CV, które już masz. Nie musisz od razu wybierać stylu ani układać strony.",
    },
    {
        number: "02",
        title: "Nadaj jej formę",
        text: "Treść trafia do prawdziwego dokumentu A4. Tu zmieniasz kolejność sekcji, dodajesz wpisy, wybierasz szablon i dopracowujesz sposób, w jaki CV jest czytane.",
    },
    {
        number: "03",
        title: "Dopracuj, zanim wyślesz",
        text: "Popraw język, sprawdź długość, wybierz gęstość i styl. Gdy wszystko jest na miejscu, pobierasz dokładnie ten dokument, który widzisz w edytorze.",
    },
];

const EDITOR_CAPABILITIES = [
    {
        title: "Dokument ma strukturę — i możesz ją zmieniać.",
        text: "Dodawaj sekcje i wpisy, usuwaj je, zmieniaj kolejność albo przenoś wybrane części między kolumnami.",
    },
    {
        title: "Mniej ścisku albo więcej oddechu — bez przebudowy od zera.",
        text: "Dostosuj rytm dokumentu jednym wyborem albo dopracuj odstępy precyzyjnie.",
    },
    {
        title: "Styl można zmieniać, nie rozbierając szablonu na części.",
        text: "W wybranych szablonach zmienisz paletę i skalę typografii. Reszta kompozycji pozostaje spójna.",
    },
    {
        title: "Potrzebujesz więcej swobody? Możesz ją odblokować.",
        text: "Tryb swobodny daje dostęp do ręcznego układu, tekstu, zdjęć i elementów graficznych. Na co dzień nie musisz z niego korzystać.",
    },
];

const AI_CAPABILITIES = [
    ["Brzmi zbyt ogólnie?", "Popraw styl bez dopisywania nowych faktów."],
    ["Na stronie zrobiło się za ciasno?", "Skróć tekst dopiero wtedy, gdy sam układ nie wystarcza."],
    ["Potrzebujesz drugiej wersji językowej?", "Przetłumacz CV, zachowując jego strukturę."],
    ["Chcesz sprawdzić, jak CV czyta się maszynowo?", "Sprawdź tekst PDF, nagłówki i ogólną czytelność dla ATS."],
];

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

// "import" costs a paid OpenAI call (POST /ai/extract_cv) and stays gated
// behind registration — anonymous visitors are deliberately not given it for
// free (see docs/superpowers/specs/2026-08-07-onboarding-monetization-design.md
// §4.5). Every other start intent is frontend-only / zero-cost, so it goes
// straight into guest mode regardless of auth state.
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

    // Free includes one lifetime import; Pro unlocks more imports + clean PDF + AI.
    const importUrl = buildStartUrl("import", "free");
    const wizardUrl = buildStartUrl("wizard", "free");
    const demoUrl = getEditorPath({ start: "demo" });
    const proRegisterUrl = "/register?plan=pro";

    // Real template mockups drive every product visual — no stock imagery.
    const heroFront = previewById("portico");
    const heroBack = previewById("monument");
    const editorMock = previewById("meridian");
    // A dedicated Sterling render of the SAME CV content shown in the
    // "before" card (Jan Kowalski) — not a template picker mockup with the
    // generic demo persona, and not `previewById` (which only resolves the
    // standard per-template mockup path) — so the before/after pair reads as
    // one real transformation, not two unrelated documents.
    const afterMock = { name: "Sterling", image: "/template-mockups/sterling-showcase.png" };
    const finalDocs = ["regent", "vestige", "slate"].map(previewById);

    return (
        <main className={classes.page}>
            <header className={classes.header}>
                <a className={classes.brand} href="#top" aria-label="CV Studio — strona główna">
                    <img src="/cv-studio-logo.svg" alt="" />
                </a>
                <nav className={classes.navigation} aria-label="Główna nawigacja">
                    <a href="#jak-to-dziala">Jak to działa</a>
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
                <div className={classes.heroCopy}>
                    <p className={classes.kicker}>Edytor CV · prawdziwy format A4</p>
                    <h1>Zmieniaj treść.<br /><em>Nie naprawiaj za każdym razem układu.</em></h1>
                    <p className={classes.heroLead}>
                        CV Studio bierze na siebie warstwę dokumentu — strukturę, rytm,
                        odstępy i strony. Ty pracujesz nad treścią: dodajesz doświadczenie,
                        zmieniasz szablon, skracasz opis albo wybierasz inny styl. Dokument
                        układa się razem z Tobą.
                    </p>
                    <div className={classes.heroActions}>
                        <CtaLink to={wizardUrl} event="hero_wizard">Stwórz CV za darmo</CtaLink>
                        <CtaLink to={importUrl} event="hero_import" variant="secondary">
                            Mam już CV — wgraj PDF
                        </CtaLink>
                    </div>
                    <p className={classes.heroTertiary}>
                        <Link to={demoUrl} onClick={() => queueGuestEvent("hero_demo")}>
                            Chcesz najpierw zobaczyć, jak to działa? Otwórz przykładowe CV <ArrowIcon />
                        </Link>
                    </p>
                    <ul className={classes.heroTrust} aria-label="Korzyści na start">
                        <li>Zacznij bez konta</li>
                        <li>Pierwszy import gratis</li>
                        <li>Podgląd = gotowy PDF</li>
                    </ul>
                </div>

                <div className={classes.heroVisual} aria-label="Przykładowe szablony CV Studio">
                    <div className={classes.visualOrbit} aria-hidden="true" />
                    <div className={classes.heroStack}>
                        <img
                            className={classes.heroDocBack}
                            src={heroBack.image}
                            alt=""
                            aria-hidden="true"
                            loading="eager"
                        />
                        <img
                            className={classes.heroDocFront}
                            src={heroFront.image}
                            alt={`Szablon ${heroFront.name} w CV Studio`}
                            loading="eager"
                            fetchPriority="high"
                        />
                        <span className={classes.heroChip}>To, co widzisz, trafia do PDF</span>
                    </div>
                    <div className={classes.heroCountLabel}>
                        <b>{TEMPLATE_COUNT}</b>
                        <span>szablonów · jedna treść</span>
                    </div>
                </div>
            </section>

            <section className={classes.transformation}>
                <div className={classes.transformationCopy}>
                    <p className={classes.kicker}>Masz już CV?</p>
                    <h2>Treść już masz.<br /><em>Nie musisz budować dokumentu od początku.</em></h2>
                    <p>
                        Wgraj obecne CV, a jego treść trafi do edytowalnej struktury. Potem
                        zaczyna się właściwa praca: możesz ją uporządkować, skrócić, przenieść
                        do innego szablonu i dopracować bez przepisywania wszystkiego od nowa.
                    </p>
                    <div className={classes.transformationPoints}>
                        <span><CheckIcon />Ta sama treść</span>
                        <span><CheckIcon />Zupełnie inny dokument</span>
                        <span><CheckIcon />Dalsza edycja bezpośrednio na A4</span>
                    </div>
                    <CtaLink to={importUrl} event="before_after_import" variant="link">
                        Pracuj dalej na swoim CV
                    </CtaLink>
                </div>
                <div className={classes.beforeAfter}>
                    <article className={classes.beforeCard}>
                        <div className={classes.documentLabel}><span>PRZED</span> Dotychczasowe CV</div>
                        <img
                            className={classes.oldDocument}
                            src="/images/bad_cv.png"
                            alt="Przykład dotychczasowego CV w formie zwykłego dokumentu tekstowego"
                        />
                        <p>Ta sama treść, tylko trudna do odświeżenia.</p>
                    </article>
                    <div className={classes.transformArrow} aria-hidden="true">
                        <span>Twoje dane</span>
                        <ArrowIcon />
                        <span>nowy układ</span>
                    </div>
                    <article className={classes.afterCard}>
                        <div className={classes.documentLabel}><span>PO</span> Wersja w CV Studio</div>
                        <img src={afterMock.image} alt={`Przykład odświeżonego CV w szablonie ${afterMock.name}`} />
                        <p>Nowy szablon, te same informacje i dalsza edycja.</p>
                    </article>
                </div>
            </section>

            <section id="jak-to-dziala" className={classes.stepsSection}>
                <div className={classes.stepsHeading}>
                    <p className={classes.kicker}>Od treści do dokumentu</p>
                    <h2>Nie musisz myśleć o CV jak o projekcie graficznym.</h2>
                    <p className={classes.sectionLead}>
                        Zaczynasz od tego, co chcesz powiedzieć. CV Studio zajmuje się tym,
                        jak ta treść ma zachować się na stronie.
                    </p>
                </div>
                <ol className={classes.stepsList}>
                    {HOW_IT_WORKS.map((step) => (
                        <li key={step.number}>
                            <span>{step.number}</span>
                            <div>
                                <h3>{step.title}</h3>
                                <p>{step.text}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section className={classes.documentEngineSection}>
                <div className={classes.documentEngineIntro}>
                    <p className={classes.kicker}>Dokument, który reaguje na treść</p>
                    <h2>Dopisujesz jedno zdanie.<br /><em>Reszta CV wie, co z nim zrobić.</em></h2>
                </div>
                <div className={classes.documentEngineBody}>
                    <p>
                        Tekst rośnie, rekordy się przesuwają, sekcje przechodzą na kolejną
                        stronę. CV Studio przelicza układ po zmianach, pilnuje integralności
                        wpisów i nie zostawia nagłówków samotnie na końcu strony.
                    </p>
                    <p>
                        Jeśli CV robi się za długie, najpierw szukamy miejsca w samym układzie.
                        Dopiero gdy to nie wystarcza, możesz poprosić AI o skrócenie treści.
                    </p>
                    <ul className={classes.documentEngineSignals}>
                        <li>Więcej treści <ArrowIcon /> układ przelicza strony</li>
                        <li>Mniej treści <ArrowIcon /> dokument odzyskuje oddech</li>
                        <li>Za długie CV <ArrowIcon /> najpierw układ, potem AI</li>
                    </ul>
                </div>
            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.templatesHeader}>
                    <div>
                        <p className={classes.kicker}>Szablony, nie klatki</p>
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

            <section className={classes.editorSection}>
                <div className={classes.editorVisual}>
                    <div className={classes.editorCaption}>Edytor CV / A4</div>
                    <div className={classes.editorMock}>
                        <img
                            src={editorMock.image}
                            alt={`Dokument CV w edytorze A4 — szablon ${editorMock.name}`}
                            loading="lazy"
                        />
                    </div>
                    <span className={`${classes.aiCard} ${classes.aiCardOne}`}>Sekcje i wpisy</span>
                    <span className={`${classes.aiCard} ${classes.aiCardTwo}`}>Rytm dokumentu</span>
                    <span className={`${classes.aiCard} ${classes.aiCardThree}`}>Tryb swobodny</span>
                </div>
                <div className={classes.editorContent}>
                    <p className={classes.kicker}>Edycja bezpośrednio na A4</p>
                    <h2>Klikasz w CV i zmieniasz właśnie to, co widzisz.</h2>
                    <p className={classes.editorLead}>
                        Nie edytujesz formularza obok podglądu. Pracujesz bezpośrednio na
                        stronie: zmieniasz tekst, dodajesz doświadczenia i sekcje, porządkujesz
                        ich kolejność i obserwujesz, jak dokument układa się razem z treścią.
                    </p>
                    <div className={classes.capabilityList}>
                        {EDITOR_CAPABILITIES.map((capability) => (
                            <article key={capability.title}>
                                <span><CheckIcon /></span>
                                <div>
                                    <h3>{capability.title}</h3>
                                    <p>{capability.text}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className={classes.wysiwygSection}>
                <div>
                    <p className={classes.kicker}>Od podglądu do PDF</p>
                    <h2>Podgląd nie jest przybliżeniem.<br /><em>Jest dokumentem.</em></h2>
                </div>
                <div className={classes.wysiwygCopy}>
                    <p>
                        Pracujesz na stronie A4 w tych samych proporcjach, które trafiają do
                        eksportu. Nie odkrywasz po pobraniu, że tekst przesunął się, sekcja
                        zmieniła stronę albo font zachował się inaczej.
                    </p>
                    <strong>To, co widzisz <ArrowIcon /> to pobierasz.</strong>
                </div>
            </section>

            <section className={classes.aiSection}>
                <div className={classes.aiIntro}>
                    <p className={classes.kicker}>AI, tam gdzie ma sens</p>
                    <h2>Nie oddawaj AI całego CV.<br /><em>Daj mu konkretne zadanie.</em></h2>
                    <p>
                        Popraw ton jednego fragmentu. Skróć zbyt długi opis. Przetłumacz
                        dokument. Sprawdź, czy treść jest spójna. AI pracuje nad słowami —
                        geometria CV pozostaje zadaniem edytora.
                    </p>
                </div>
                <div className={classes.aiCapabilityGrid}>
                    {AI_CAPABILITIES.map(([title, text], index) => (
                        <article key={title}>
                            <span>0{index + 1}</span>
                            <h3>{title}</h3>
                            <p>{text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker}>CV to prywatny dokument</p>
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
                    <p className={classes.kicker}>Cennik</p>
                    <h2>Najpierw sprawdź, czy CV Studio Ci odpowiada.<br /><em>Zapłać dopiero za gotowy efekt.</em></h2>
                    <p>
                        Darmowy plan pozwala stworzyć i sprawdzić CV. Pro odblokowuje czysty
                        PDF, wszystkie szablony i narzędzia potrzebne do finalnej wersji.
                    </p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Darmowy</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Stwórz i sprawdź swoje CV.</p>
                        <ul>
                            <li><CheckIcon />Zacznij od Regenta lub Sterlinga</li>
                            <li><CheckIcon />Zaimportuj jedno istniejące CV</li>
                            <li><CheckIcon />Edytuj i zapisuj dokument</li>
                            <li><CheckIcon />Pobierz PDF z oznaczeniem wersji darmowej</li>
                        </ul>
                        <CtaLink to={wizardUrl} event="pricing_free" variant="secondary">
                            Zacznij za darmo
                        </CtaLink>
                        <p className={classes.planFootnote}>Bez karty.</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Gotowe CV do wysłania</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>zł</small></p>
                        <p className={classes.planSummary}>Gotowe CV do wysłania.</p>
                        <p className={classes.planPeriod}>30 dni pełnego dostępu</p>
                        <ul>
                            <li><CheckIcon />Wszystkie szablony</li>
                            <li><CheckIcon />Czysty PDF bez oznaczenia CV Studio</li>
                            <li><CheckIcon />AI do poprawiania, skracania i tłumaczenia treści</li>
                            <li><CheckIcon />Sprawdzanie czytelności dla ATS</li>
                            <li><CheckIcon />Kolejne importy CV</li>
                            <li><CheckIcon />Nielimitowane projekty i eksporty w okresie Pro</li>
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
                    <p className={classes.kicker}>FAQ</p>
                    <h2>Najczęstsze pytania</h2>
                </div>
                <div className={classes.faqList}>
                    <details open>
                        <summary>Czy mogę najpierw zobaczyć, jak działa CV Studio?</summary>
                        <p>Tak. Możesz otworzyć przykładowe CV i sprawdzić edycję bez zakładania konta. Konto jest potrzebne później do zapisu i eksportu dokumentu.</p>
                    </details>
                    <details>
                        <summary>Mam już gotowe CV. Czy naprawdę muszę wpisywać wszystko od nowa?</summary>
                        <p>Nie. Możesz wgrać PDF i wykorzystać jego treść jako punkt wyjścia. CV Studio odczyta dane i ułoży je w edytowalnej strukturze. Pierwszy import jest dostępny bezpłatnie po utworzeniu konta.</p>
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
                        <p>Tak. CV Studio może sprawdzić, czy tekst PDF jest możliwy do odczytania oraz czy dokument używa czytelnej struktury i typowych nagłówków. Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym.</p>
                    </details>
                    <details>
                        <summary>Czy pobrany PDF naprawdę będzie wyglądał tak samo jak w edytorze?</summary>
                        <p>Taki jest model CV Studio. Edytor pracuje na rzeczywistym formacie A4, a PDF korzysta z tej samej geometrii dokumentu.</p>
                    </details>
                    <details>
                        <summary>Czy Pro to subskrypcja?</summary>
                        <p>Nie. Pro kosztuje 59 zł i daje 30 dni dostępu. Płatność nie odnawia się automatycznie.</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta}>
                <div className={classes.finalCtaInner}>
                    <div className={classes.finalCtaCopy}>
                        <p className={classes.kicker}>Twoja następna wersja</p>
                        <h2>Poświęć czas treści.<br /><em>Nie walce z dokumentem.</em></h2>
                        <p>
                            Zacznij od kilku kroków albo od CV, które już masz. Gdy treść będzie
                            gotowa, CV Studio pomoże nadać jej formę, którą możesz naprawdę wysłać.
                        </p>
                        <div className={classes.finalActions}>
                            <CtaLink to={wizardUrl} event="final_wizard">Stwórz CV za darmo</CtaLink>
                            <CtaLink to={importUrl} event="final_import" variant="link">
                                Mam już CV — wgraj PDF
                            </CtaLink>
                        </div>
                        <p className={classes.finalFootnote}>Bez karty · Pro nie odnawia się automatycznie</p>
                    </div>
                    <div className={classes.finalStack} aria-hidden="true">
                        {finalDocs.map((doc, index) => (
                            <img
                                key={doc.id}
                                src={doc.image}
                                alt=""
                                loading="lazy"
                                className={classes[`finalDoc${index + 1}`]}
                            />
                        ))}
                    </div>
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
                            <a href="#jak-to-dziala">Jak to działa</a>
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
