/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: hero → capabilities + templates → privacy → pricing → FAQ → final CTA → footer.
 *
 * The hero selects a Free template before A4 setup; demo is its secondary
 * action. Import remains in the capabilities section:
 *   - A4 setup → guest editor → register to save or export
 *   - Import → register → extract data → pick template → editor (metered request)
 *
 * Only the "import" CTA still detours through registration/login, because it
 * calls the account-scoped `POST /ai/extract_cv` endpoint. Setup and demo go straight
 * to `/cvstudio/guest?start=...` (or `/cvstudio/{username}` when already
 * authenticated). Each CTA queues a per-source funnel event so analytics can
 * tell which surface drove the click (see queueGuestEvent + events.py).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import HeroTemplateShowcase from "./HeroTemplateShowcase";
import { SiteHeader, SiteFooter } from "../../components/common/SiteLayout/SiteLayout";
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
const FREE_TEMPLATES = TEMPLATES.filter((template) => template.tier === "free");

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
    const [selectedTemplateId, setSelectedTemplateId] = useState(
        FREE_TEMPLATES.find((template) => template.id === "linden")?.id || FREE_TEMPLATES[0]?.id || null,
    );
    useEffect(() => {
        // Warm the optional API while visitors read the landing page. Loading
        // the marketing content never depends on the backend being available.
        wakeBackend();
    }, []);

    // Free includes one successful monthly import; Pro removes that quota and
    // adds scale, every template, and AI workflows without changing PDF quality.
    const importUrl = buildStartUrl("import", "free");
    const newCvUrl = buildStartUrl("new", "free");
    const selectedTemplateUrl = getEditorPath({ start: "new", template: selectedTemplateId });
    const demoUrl = getEditorPath({ start: "demo" });
    const proRegisterUrl = "/register?plan=pro";

    return (
        <main className={classes.page}>
            <SiteHeader />

            <section id="top" className={classes.hero}>
                <div className={classes.heroCopy}>
                    <p className={classes.kicker} data-section-index="01">Kreator CV online</p>
                    <div className={classes.heroHeading}>
                        <h1>Czytelne CV.<br /><span>Gotowe do wysłania.</span></h1>
                        <p className={classes.heroSubheading}>Wybierz szablon, opisz doświadczenie i popraw tekst bezpośrednio na CV. Pobierz gotowy PDF bez znaku wodnego.</p>
                    </div>
                    <div className={classes.heroActions}>
                        <CtaLink to={selectedTemplateUrl} event="hero_new_cv">Stwórz CV z tym szablonem</CtaLink>
                        <CtaLink to={demoUrl} event="hero_demo" variant="secondary">
                            Wypróbuj edytor
                        </CtaLink>
                    </div>
                    <p className={classes.accountNote}>Zacznij bez rejestracji. Do zapisu i pobrania CV potrzebujesz darmowego konta.</p>
                    <ul className={classes.heroTrust} aria-label="Korzyści na start">
                        <li>Edycja za 0 zł</li>
                        <li>PDF bez znaku wodnego</li>
                        <li>{FREE_TEMPLATES.length} darmowe szablony</li>
                    </ul>
                </div>
                <HeroTemplateShowcase
                    templates={FREE_TEMPLATES}
                    selectedId={selectedTemplateId}
                    onSelect={setSelectedTemplateId}
                    mobileAction={<CtaLink to={selectedTemplateUrl} event="hero_new_cv">Stwórz CV z wybranym szablonem</CtaLink>}
                />
            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.offerIntro}>
                    <div className={classes.offerStatement}>
                        <p className={classes.kicker} data-section-index="02">Od treści do gotowego CV</p>
                        <h2>
                            <span>Zmień szablon.</span>
                            <span>Zachowaj treść.</span>
                        </h2>
                        <p className={classes.offerLead}>
                            Wpisz doświadczenie raz. Zmieniaj układ i dopracowuj opisy, gdy przygotowujesz CV do kolejnej aplikacji.
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
                                <h3>Wykorzystaj treść swojego PDF</h3>
                                <p>Wgraj obecne CV, przenieś jego treść do wybranego szablonu i popraw ją w edytorze. Po założeniu konta masz jeden udany import miesięcznie za darmo.</p>
                                <CtaLink to={importUrl} event="hero_import" variant="link">Wgraj swoje CV w PDF</CtaLink>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">02</span>
                            <div>
                                <h3>Poprawiaj tekst prosto na CV</h3>
                                <p>Kliknij opis, aby go zmienić. Ustaw czcionki, odstępy i kolejność sekcji — efekt widzisz na dokumencie podczas edycji.</p>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">03</span>
                            <div>
                                <h3>Opisz doświadczenie konkretniej</h3>
                                <p>AI w Pro pomoże skrócić opisy, poprawić język i dopasować CV do oferty pracy. Ty wybierasz, które zmiany zastosować.</p>
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
                    <p id="template-gallery-title" className={classes.templateGalleryLabel}>Wybierz wygląd swojego CV</p>
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
                                        to={`/templates/${template.id}`}
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
                <CtaLink to="/templates" event="templates_new_cv" variant="link">
                    Wybierz szablon i stwórz CV
                </CtaLink>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker} data-section-index="03">Prywatność</p>
                    <h2>Twoje CV nie jest publiczne.</h2>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />Do zapisanych CV i zdjęć wrócisz po zalogowaniu na swoje konto.</li>
                    <li><CheckIcon />Oryginalny PDF nie jest przechowywany w historii importu.</li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker} data-section-index="04">Cennik</p>
                    <h2>
                        <span>Zacznij za 0 zł.</span>
                        <em>Dodaj AI, gdy potrzebujesz.</em>
                    </h2>
                    <p>
                        W obu planach pobierzesz PDF bez znaku wodnego. Wybierz potrzebną liczbę projektów i dostęp do AI.
                    </p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Darmowy</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Przygotuj CV samodzielnie i pobierz gotowy dokument.</p>
                        <ul>
                            {FREE_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <CtaLink to={newCvUrl} event="pricing_free" variant="secondary">
                            Stwórz CV za darmo
                        </CtaLink>
                        <p className={classes.planFootnote}>Bez karty · Bez limitu czasu</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Z pomocą AI</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>zł</small></p>
                        <p className={classes.planSummary}>Dopracuj treść z AI i twórz osobne wersje CV do różnych ofert.</p>
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
                            Wybierz Pro na 30 dni <ArrowIcon />
                        </Link>
                        <p className={classes.planFootnote}>Jedna płatność · Bez automatycznego odnowienia</p>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker} data-section-index="05">Pytania przed startem</p>
                    <h2>Co warto wiedzieć?</h2>
                </div>
                <div className={classes.faqList}>
                    <details open>
                        <summary>Czy pobiorę CV za darmo?</summary>
                        <p>Tak. Darmowe konto obejmuje 3 pobrania PDF miesięcznie, bez znaku wodnego. Możesz korzystać z edytora i {FREE_TEMPLATES.length} darmowych szablonów. Pozostałe limity znajdziesz w <Link to="/pricing">cenniku</Link>; pomoc AI jest dostępna w Pro.</p>
                    </details>
                    <details>
                        <summary>Czy muszę założyć konto, żeby zacząć?</summary>
                        <p>Nie. Wybierz szablon i zacznij edytować bez rejestracji. Darmowe konto założysz, gdy zechcesz zapisać CV, pobrać PDF lub zaimportować swój dokument.</p>
                    </details>
                    <details>
                        <summary>Co stanie się z moim CV po imporcie PDF?</summary>
                        <p>Odczytamy treść i ułożymy ją w wybranym szablonie, aby można było ją edytować. Sprawdź odczytane dane — wygląd oryginału nie jest kopiowany. Import wymaga konta; w planie Darmowym masz jeden udany import miesięcznie.</p>
                    </details>
                    <details>
                        <summary>Czy Pro odnawia się automatycznie?</summary>
                        <p>Nie. Płacisz jednorazowo 59 zł za 30 dni dostępu. Po tym czasie Pro wygasa, a kolejna opłata nie jest pobierana automatycznie.</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta} aria-labelledby="final-cta-title">
                <p className={classes.kicker} data-section-index="06">Zacznij od szablonu</p>
                <h2 id="final-cta-title">Przygotuj CV do kolejnej aplikacji.</h2>
                <CtaLink to={newCvUrl} event="final_wizard">Stwórz CV za darmo</CtaLink>
            </section>

            <SiteFooter />
        </main>
    );
}
