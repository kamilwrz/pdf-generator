/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: hero → capabilities + templates → privacy → pricing → FAQ → final CTA → footer.
 *
 * Two funnels, one primary action ("Stwórz CV za darmo" → A4 setup)
 * and one secondary ("Mam już CV — wgraj PDF" → import):
 *   - A4 setup → guest editor → register to save or export
 *   - Import → register → extract data → pick template → editor (metered request)
 *
 * Only the "import" CTA still detours through registration/login, because it
 * calls the account-scoped `POST /ai/extract_cv` endpoint. Setup and demo go straight
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
    const newCvUrl = buildStartUrl("new", "free");
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
                        to={newCvUrl}
                        onClick={() => queueGuestEvent("hero_new_cv")}
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
                    <p className={classes.kicker} data-section-index="01">Kreator CV online</p>
                    <div className={classes.heroHeading}>
                        <h1>Twoje doświadczenie.<br />Dobrze pokazane.</h1>
                        <p className={classes.heroSubheading}>Stwórz CV, które z dumą wyślesz.<br />Wybierz szablon, dodaj treść i pobierz PDF.</p>
                    </div>
                    <div className={classes.heroActions}>
                        <CtaLink to={newCvUrl} event="hero_new_cv">Stwórz CV za darmo</CtaLink>
                        <CtaLink to={importUrl} event="hero_import" variant="secondary">
                            Mam już CV — wgraj PDF
                        </CtaLink>
                    </div>
                    <p className={classes.accountNote}>Zaczniesz bez konta. Do zapisu i pobrania założysz darmowe konto.</p>
                    <p className={classes.heroTertiary}>
                        <Link
                            to={demoUrl}
                            aria-label="Zobacz przykładowe CV — demo"
                            onClick={() => queueGuestEvent("hero_demo")}
                        >
                            Wypróbuj na przykładzie <ArrowIcon />
                        </Link>
                    </p>
                    <ul className={classes.heroTrust} aria-label="Korzyści na start">
                        <li>Start za 0 zł</li>
                        <li>PDF bez znaku wodnego</li>
                        <li>AI w planie Pro</li>
                    </ul>
                </div>

            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.offerIntro}>
                    <div className={classes.offerStatement}>
                        <p className={classes.kicker} data-section-index="02">Po Twojemu</p>
                        <h2>
                            <span>Jedna treść.</span>
                            <span>Twój styl.</span>
                        </h2>
                        <p className={classes.offerLead}>
                            Zmieniaj wygląd bez przepisywania CV.
                        </p>
                    </div>
                    {/*
                      The ruled feature list replaces generic cards without pretending
                      the product has one mandatory workflow. Its source order remains
                      the reading order on compact and zoomed layouts.
                    */}
                    <ul className={classes.offerSteps} aria-label="Najważniejsze funkcje CV Studio">
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">01</span>
                            <div>
                                <h3>Masz CV? Wykorzystaj je.</h3>
                                <p>Wgraj PDF. Przeniesiemy jego treść do edytowalnego szablonu.</p>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">02</span>
                            <div>
                                <h3>Kliknij. Popraw. Gotowe.</h3>
                                <p>Edytuj tekst bezpośrednio na CV. Od razu zobaczysz efekt.</p>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">03</span>
                            <div>
                                <h3>Mniej słów. Więcej konkretu.</h3>
                                <p>AI w Pro pomoże skrócić opis, poprawić styl i dopasować treść do oferty.</p>
                                {/* Static sample explains the paid feature without running AI or promising a live result. */}
                                <dl className={classes.copyExample} aria-label="Przykład poprawy stylu z AI w Pro">
                                    <div><dt>Przed</dt><dd>Byłem odpowiedzialny za przygotowywanie raportów sprzedażowych.</dd></div>
                                    <div><dt>Po</dt><dd>Przygotowywałem raporty sprzedażowe.</dd></div>
                                </dl>
                            </div>
                        </li>
                    </ul>
                </div>

                <div className={classes.templateGalleryHeader}>
                    <p id="template-gallery-title" className={classes.templateGalleryLabel}>Szablony CV</p>
                </div>
                {/*
                  Endless right→left marquee of every template mockup. The track
                  is duplicated so translateX(-50%) loops without a seam. Hover
                  (or keyboard focus) pauses the animation and scales the card.
                */}
                <div
                    className={classes.templateMarquee}
                    role="region"
                    aria-labelledby="template-gallery-title"
                    aria-description={`Galeria ${TEMPLATE_COUNT} szablonów CV`}
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
                                        to={newCvUrl}
                                        className={classes.templateCard}
                                        tabIndex={copy === 1 ? -1 : undefined}
                                        onClick={() => queueGuestEvent("templates_new_cv")}
                                    >
                                        <img
                                            src={template.image}
                                            alt={copy === 0 ? `Szablon CV ${template.name}` : ""}
                                            loading="lazy"
                                        />
                                        <span>
                                            <b>{template.name}</b>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <CtaLink to={newCvUrl} event="templates_new_cv" variant="link">
                    Znajdź swój styl
                </CtaLink>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker} data-section-index="03">Prywatność</p>
                    <h2>Twoje CV nie jest publiczne.</h2>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />Zapisane CV i zdjęcia są dostępne na Twoim koncie.</li>
                    <li><CheckIcon />Historia importu nie przechowuje oryginalnego PDF.</li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker} data-section-index="04">Cennik</p>
                    <h2>
                        <span>Zacznij za 0 zł.</span>
                        <em>Pro, gdy chcesz więcej.</em>
                    </h2>
                    <p>
                        Gotowy PDF bez znaku wodnego w obu planach.
                    </p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Darmowy</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Wszystko, by przygotować pierwsze CV.</p>
                        <ul>
                            {FREE_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <CtaLink to={newCvUrl} event="pricing_free" variant="secondary">
                            Zacznij za darmo
                        </CtaLink>
                        <p className={classes.planFootnote}>Bez karty · Bez limitu czasu</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Z pomocą AI</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>zł</small></p>
                        <p className={classes.planSummary}>Dopracuj treść. Przygotuj kolejne wersje.</p>
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
                        <p className={classes.planFootnote}>Jedna płatność · Bez automatycznego odnowienia</p>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker} data-section-index="05">Warto wiedzieć</p>
                    <h2>Jeszcze coś?</h2>
                </div>
                <div className={classes.faqList}>
                    <details open>
                        <summary>Co jest darmowe?</summary>
                        <p>Edytor, 3 szablony i PDF bez znaku wodnego. Limity znajdziesz w <a href="#cennik">cenniku</a>. Funkcje AI są dostępne w Pro.</p>
                    </details>
                    <details>
                        <summary>Czy potrzebuję konta?</summary>
                        <p>Zaczniesz i wypróbujesz edytor bez konta. Darmowe konto jest potrzebne do zapisu, pobrania PDF i importu własnego CV.</p>
                    </details>
                    <details>
                        <summary>Czy mogę wgrać swoje CV?</summary>
                        <p>Tak. Odczytamy treść PDF i ułożymy ją w wybranym szablonie. Sprawdź dane po imporcie — wygląd oryginału nie jest kopiowany.</p>
                    </details>
                    <details>
                        <summary>Czy Pro odnawia się automatycznie?</summary>
                        <p>Nie. Płacisz 59 zł za 30 dni dostępu. Bez subskrypcji i kolejnych automatycznych opłat.</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta} aria-labelledby="final-cta-title">
                <p className={classes.kicker} data-section-index="06">Twój następny krok</p>
                <h2 id="final-cta-title">Pokaż, co potrafisz.</h2>
                <CtaLink to={newCvUrl} event="final_wizard">Stwórz CV za darmo</CtaLink>
            </section>

            <footer className={classes.footer}>
                <div className={classes.footerTop}>
                    <div>
                        <a className={classes.brand} href="#top" aria-label="CV Studio — strona główna">
                            <img src="/cv-studio-logo.svg" alt="" />
                        </a>
                        <p className={classes.footerTagline}>
                            Twoje doświadczenie. Dobrze pokazane.
                        </p>
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
                            <Link to={newCvUrl}>Stwórz CV</Link>
                        </div>
                        <div className={classes.footerCol}>
                            <p className={classes.footerColTitle}>Informacje</p>
                            <a href="#privacy">Prywatność</a>
                        </div>
                    </nav>
                </div>
                <div className={classes.footerBottom}>
                    <small>© 2026 CV Studio</small>
                </div>
            </footer>
        </main>
    );
}
