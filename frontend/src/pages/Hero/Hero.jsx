/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: header → hero → before/after → how it works (3 steps) →
 * templates → editor + AI → trust strip → pricing → FAQ → final CTA → footer.
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
        title: "Dodaj swoje dane",
        text: "Wgraj obecne CV albo odpowiedz na kilka pytań w kreatorze.",
    },
    {
        number: "02",
        title: "Wybierz wygląd",
        text: "Zobacz dostępne szablony i wybierz ten, który najlepiej pasuje.",
    },
    {
        number: "03",
        title: "Dopracuj i pobierz",
        text: "Edytuj treść na płótnie A4, skorzystaj z podpowiedzi i pobierz PDF.",
    },
];

const EDITOR_CAPABILITIES = [
    {
        title: "Popraw treść",
        text: "Wzmocnij opisy, popraw język albo skróć zbyt długie CV.",
    },
    {
        title: "Sprawdź CV",
        text: "Ocena treści, czytelność dla ATS i dopasowanie do oferty.",
    },
    {
        title: "Dopasuj wygląd",
        text: "Zmień gęstość, układ i szablon bez przepisywania dokumentu.",
    },
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
    const finalDocs = ["nova", "vestige", "slate"].map(previewById);

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
                    <p className={classes.kicker}>Inteligentny kreator CV</p>
                    <h1>CV, które dopasowuje się<br /><em>do Twojej treści.</em></h1>
                    <p className={classes.heroLead}>
                        Stwórz CV krok po kroku albo wgraj obecny dokument. Zmieniaj szablony,
                        poprawiaj treść z AI i edytuj bezpośrednio na A4 — CV Studio pilnuje
                        układu, odstępów i podziału na strony.
                    </p>
                    <div className={classes.heroActions}>
                        <CtaLink to={wizardUrl} event="hero_wizard">Stwórz CV za darmo</CtaLink>
                        <CtaLink to={importUrl} event="hero_import" variant="secondary">
                            Mam już CV — wgraj PDF
                        </CtaLink>
                    </div>
                    <p className={classes.heroTertiary}>
                        <Link to={demoUrl} onClick={() => queueGuestEvent("hero_demo")}>
                            Najpierw chcesz zobaczyć produkt? Otwórz przykładowe CV w edytorze <ArrowIcon />
                        </Link>
                    </p>
                    <ul className={classes.heroTrust} aria-label="Korzyści na start">
                        <li>Bez konta na start</li>
                        <li>Pierwszy import CV gratis</li>
                        <li>PDF zgodny z podglądem</li>
                    </ul>
                </div>

                <div className={classes.heroVisual} aria-label="Przykładowe CV z CV Studio">
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
                            alt={`Przykładowe CV w szablonie ${heroFront.name}`}
                            loading="eager"
                            fetchPriority="high"
                        />
                        <span className={classes.heroChip}>Edytujesz dokładnie ten dokument</span>
                    </div>
                    <div className={classes.heroCountLabel}>
                        <b>{TEMPLATE_COUNT}</b>
                        <span>różnych szablonów</span>
                    </div>
                </div>
            </section>

            <section className={classes.transformation}>
                <div className={classes.transformationCopy}>
                    <p className={classes.kicker}>Masz już CV?</p>
                    <h2>Nie zaczynaj<br />od nowa.<br /><em>Zmień formę, zachowaj doświadczenie.</em></h2>
                    <p>
                        Wgraj swoje CV w PDF. CV Studio przeniesie dane do wybranego szablonu,
                        a Ty poprawisz wynik bezpośrednio w edytorze.
                    </p>
                    <div className={classes.transformationPoints}>
                        <span><CheckIcon />Nie przepisujesz całego CV</span>
                        <span><CheckIcon />Zachowujesz swoje doświadczenie i dane</span>
                        <span><CheckIcon />Każdą zmianę możesz poprawić ręcznie</span>
                    </div>
                    <CtaLink to={importUrl} event="before_after_import" variant="link">
                        Wgraj moje CV
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
                    <p className={classes.kicker}>Jak to działa</p>
                    <h2>Od danych<br />do gotowego PDF.</h2>
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

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.templatesHeader}>
                    <div>
                        <p className={classes.kicker}>{TEMPLATE_COUNT} indywidualnych szablonów</p>
                        <h2>Nie tylko<br />zmiana koloru.</h2>
                    </div>
                    <p>
                        Każdy szablon ma własny układ, typografię i charakter — od
                        klasycznych CV po bardziej wyraziste projekty.
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
                    Stwórz CV i wybierz styl
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
                    <span className={`${classes.aiCard} ${classes.aiCardOne}`}>Popraw treść</span>
                    <span className={`${classes.aiCard} ${classes.aiCardTwo}`}>ATS</span>
                    <span className={`${classes.aiCard} ${classes.aiCardThree}`}>Dopasuj układ</span>
                </div>
                <div className={classes.editorContent}>
                    <p className={classes.kicker}>Edytor A4</p>
                    <h2>Poprawiasz CV.<br />Nie walczysz z formatowaniem.</h2>
                    <p className={classes.editorLead}>
                        Kliknij tekst, zmień kolejność sekcji albo wybierz inny szablon.
                        Układ aktualizuje się na tym samym płótnie, z którego powstaje PDF.
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
                    <p className={classes.editorNote}>
                        <span className={classes.proBadge}>AI w Pro</span>
                        AI niczego nie zmienia bez Twojej decyzji.
                    </p>
                </div>
            </section>

            <section className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker}>Prywatność</p>
                    <h2>Twoje CV pozostaje Twoje.</h2>
                    <p>
                        Dane z CV służą do przygotowania dokumentu i funkcji, które
                        sam uruchamiasz w edytorze.
                    </p>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />Edytujesz każdą zmianę ręcznie</li>
                    <li><CheckIcon />AI działa tylko dla wybranych funkcji</li>
                    <li><CheckIcon />Zasady przetwarzania danych opisujemy w aplikacji</li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker}>Cennik</p>
                    <h2>Zacznij za darmo.<br />Zapłać dopiero za gotową wersję.</h2>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Darmowy</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Stwórz i sprawdź swoje CV.</p>
                        <ul>
                            <li><CheckIcon />Kreator i pełna edycja A4</li>
                            <li><CheckIcon />2 podstawowe szablony</li>
                            <li><CheckIcon />1 darmowy import CV</li>
                            <li><CheckIcon />PDF ze znakiem CV Studio</li>
                            <li><CheckIcon />1 projekt · 3 eksporty / mies.</li>
                        </ul>
                        <CtaLink to={wizardUrl} event="pricing_free" variant="secondary">
                            Stwórz CV za darmo
                        </CtaLink>
                        <p className={classes.planFootnote}>Bez karty.</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Gotowe CV do wysłania</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>zł / 30 dni</small></p>
                        <p className={classes.planSummary}>Gotowe CV do wysłania.</p>
                        <ul>
                            <li><CheckIcon />PDF bez znaku wodnego</li>
                            <li><CheckIcon />Wszystkie szablony</li>
                            <li><CheckIcon />Kolejne importy CV</li>
                            <li><CheckIcon />AI do treści, ATS i układu</li>
                            <li><CheckIcon />Wiele wersji CV i eksportów</li>
                        </ul>
                        <Link
                            className={classes.buttonPrimary}
                            to={proRegisterUrl}
                            onClick={() => queueGuestEvent("pricing_pro")}
                        >
                            Odblokuj Pro <ArrowIcon />
                        </Link>
                        <p className={classes.planFootnote}>Jedna płatność · Bez automatycznego odnawiania</p>
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
                        <summary>Czy muszę przepisywać swoje obecne CV?</summary>
                        <p>Nie. Wgraj PDF — dane trafią do wybranego szablonu, a Ty poprawisz wynik na płótnie A4. Plan Darmowy obejmuje 1 import; w Pro importujesz kolejne CV.</p>
                    </details>
                    <details>
                        <summary>Czy mogę stworzyć CV od zera?</summary>
                        <p>Tak. Wybierz Kreator CV — poprowadzi przez dane osobowe, doświadczenie, edukację i umiejętności, a potem przejdziesz do wyboru szablonu.</p>
                    </details>
                    <details>
                        <summary>Co dostaję w planie Pro?</summary>
                        <p>PDF bez znaku wodnego, wszystkie szablony, kolejne importy oraz AI do treści, ATS i układu. Wskazówki ATS dotyczą czytelności struktury i treści — nie gwarantują odpowiedzi rekrutera ani identycznego działania każdego systemu ATS.</p>
                    </details>
                    <details>
                        <summary>Czy Pro odnawia się automatycznie?</summary>
                        <p>Nie. Pro to jedna płatność za 30 dni dostępu. Po wygaśnięciu dokumenty zostają — wracasz do planu Darmowy (eksport ze znakiem wodnym, AI zablokowane). Pro możesz odnowić, gdy znów potrzebujesz czystych PDF i AI.</p>
                    </details>
                    <details>
                        <summary>Czy AI samo zmienia moje CV?</summary>
                        <p>Nie. Poprawki tekstu, sugestie struktury i propozycje układu trafiają najpierw do podglądu lub karty decyzji. Możesz zastosować pojedynczą zmianę, odrzucić ją albo edytować dokument ręcznie.</p>
                    </details>
                    <details>
                        <summary>Czy PDF wygląda tak jak w edytorze?</summary>
                        <p>Tak. Eksport używa tego samego modelu dokumentu, geometrii i czcionek co płótno, więc zmiana zoomu nie wpływa na układ gotowego PDF.</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta}>
                <div className={classes.finalCtaInner}>
                    <div className={classes.finalCtaCopy}>
                        <p className={classes.kicker}>Gotowy?</p>
                        <h2>Zrób pierwszą wersję<br />CV za darmo.</h2>
                        <p>Zacznij od kreatora albo wgraj dokument, który już masz.</p>
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
                            Gotowe CV do wysłania — kreator, edytor A4 i eksport PDF.
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
                            <a href="#">Prywatność</a>
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
