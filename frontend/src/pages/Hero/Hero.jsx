/**
 * Outcome-focused marketing landing page for CV Studio.
 *
 * It presents PDF import and the guided wizard as two entry points that lead
 * to the same editable, exportable CV. The query parameter in each CTA keeps
 * the visitor's chosen start path through registration and login.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import { wakeBackend } from "../../services/api";

const TEMPLATE_PREVIEWS = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    image: `/template-mockups/${template.id}.png`,
}));

const HOW_IT_WORKS = [
    {
        number: "01",
        title: "Zacznij od tego, co masz",
        text: "Wgraj obecne CV w PDF albo odpowiedz na kilka pytań w kreatorze krok po kroku.",
    },
    {
        number: "02",
        title: "Wybierz nowy wygląd",
        text: "Porównaj szablony z własnymi danymi i wybierz układ odpowiedni do swojej roli.",
    },
    {
        number: "03",
        title: "Dopracuj dokument",
        text: "Edytuj treść na płótnie A4, popraw opisy i zdecyduj, które sugestie układu zastosować.",
    },
    {
        number: "04",
        title: "Pobierz PDF",
        text: "Eksport zachowuje geometrię, czcionki i kolejność stron z podglądu w edytorze.",
    },
];

const EDITOR_CAPABILITIES = [
    {
        title: "Poprawki tekstu w Standard",
        text: "Sprawdź gramatykę i styl, skróć opisy lub wzmocnij czasowniki. Każdą propozycję akceptujesz pojedynczo.",
    },
    {
        title: "Analizy w Standard",
        text: "Oceń CV, projekt, dopasowanie do oferty i podstawową czytelność ATS. To wskazówki do poprawy, nie automatyczna decyzja.",
    },
    {
        title: "Korekta Układu w Premium",
        text: "AI analizuje odstępy, wyrównanie i kolizje na całym CV, pokazuje podgląd zmian, a Ty wybierasz, które zastosować.",
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

function UploadIcon() {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function WizardIcon() {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 20V4h9l5 5v11H5Z M14 4v5h5M8.5 14h7M8.5 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function TemplateIcon() {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 5h16v4H4V5Zm0 7h7v7H4v-7Zm10 0h6v7h-6v-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    );
}

function BlankIcon() {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 4h14v16H5V4Z M9 9h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function buildStartUrl(start, plan) {
    const registered = Boolean(window.localStorage.getItem("token"));
    if (registered) return `/pdfcanvas?start=${start}`;

    return `/register?start=${start}&plan=${plan}`;
}

function StartButton({ start, plan, children, secondary = false }) {
    return (
        <Link
            to={buildStartUrl(start, plan)}
            className={secondary ? classes.buttonSecondary : classes.buttonPrimary}
        >
            {children}
            <ArrowIcon />
        </Link>
    );
}

function PathCard({ icon, eyebrow, title, text, bullets, start, plan, cta, featured }) {
    return (
        <article className={`${classes.pathCard} ${featured ? classes.pathCardFeatured : ""}`}>
            <div className={classes.pathCardTop}>
                <span className={classes.pathIcon}>{icon}</span>
                <span className={classes.pathEyebrow}>{eyebrow}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <ul className={classes.pathList}>
                {bullets.map((bullet) => (
                    <li key={bullet}><CheckIcon />{bullet}</li>
                ))}
            </ul>
            <StartButton start={start} plan={plan}>{cta}</StartButton>
        </article>
    );
}

export default function Hero() {
    useEffect(() => {
        // Warm the optional API while visitors read the landing page. Loading
        // the marketing content never depends on the backend being available.
        wakeBackend();
    }, []);

    const importUrl = buildStartUrl("import", "standard");
    const wizardUrl = buildStartUrl("wizard", "free");

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
                    <Link className={classes.navStart} to={importUrl}>Wgraj CV</Link>
                </nav>
            </header>

            <section id="top" className={classes.hero}>
                <div className={classes.heroCopy}>
                    <p className={classes.kicker}>CV Studio / dokument, który nadal jest Twój</p>
                    <h1>Masz już CV?<br /><em>Wgraj je.</em> Nie masz?<br />Stwórz je krok po kroku.</h1>
                    <p className={classes.heroLead}>
                        Wybierz punkt startu, a potem przejdź ten sam proces: dobierz szablon,
                        dopracuj treść w edytorze A4 i pobierz PDF zgodny z podglądem.
                    </p>
                    <div className={classes.heroActions}>
                        <Link className={classes.buttonPrimary} to={importUrl}>Wgraj moje CV<ArrowIcon /></Link>
                        <Link className={classes.buttonSecondary} to={wizardUrl}>Stwórz CV od początku<ArrowIcon /></Link>
                    </div>
                    <p className={classes.heroNote}>
                        <span>01</span> Bez przepisywania danych. <span>02</span> Pełna kontrola nad dokumentem.
                    </p>
                </div>

                <div className={classes.heroVisual} aria-label="Podgląd edytora CV Studio">
                    <div className={classes.visualOrbit} aria-hidden="true" />
                    <div className={classes.workflowTag}>
                        <span>Twój proces</span>
                        <b>PDF → szablon → edycja → PDF</b>
                    </div>
                    <div className={classes.editorFrame}>
                        <div className={classes.editorTopbar}>
                            <span className={classes.windowDots}><i /><i /><i /></span>
                            <span>CV / wersja poprawiona</span>
                            <span>100%</span>
                        </div>
                        <img src="/hero-canvas-mockup.png" alt="Edytor CV z dokumentem A4" />
                    </div>
                    <div className={classes.layoutSuggestion}>
                        <span className={classes.suggestionMark}>✦</span>
                        <div>
                            <b>Korekta układu</b>
                            <span>4 propozycje do sprawdzenia</span>
                        </div>
                    </div>
                </div>
            </section>

            <section id="start" className={classes.startSection}>
                <div className={classes.sectionIntro}>
                    <p className={classes.kicker}>Jeden silnik, trzy ścieżki</p>
                    <h2>Zacznij tak,<br />jak Ci wygodnie.</h2>
                    <p>
                        Szybkie CV ze szablonu, import istniejącego dokumentu albo projekt własny
                        od zera — ten sam renderer PDF, różne tryby pracy.
                    </p>
                </div>
                <div className={classes.pathGrid}>
                    <PathCard
                        featured
                        icon={<TemplateIcon />}
                        eyebrow="Najszybsza opcja"
                        title="Utwórz z szablonu"
                        text="Wybierz wygląd, wpisz lub wklej dane i dopracuj treść. Szablon pilnuje układu — bez przesuwania każdego pola o piksele."
                        bullets={["Gotowy układ od razu", "Edycja treści i sekcji", "Kolory, fonty i styl w edytorze"]}
                        start="templates"
                        plan="free"
                        cta="Wybierz szablon"
                    />
                    <PathCard
                        icon={<UploadIcon />}
                        eyebrow="Mam już CV"
                        title="Importuj CV"
                        text="Wczytaj PDF, przenieś doświadczenie, edukację i umiejętności do wybranego szablonu, potem dopracuj dokument."
                        bullets={["Bez przepisywania od zera", "Ten sam zestaw danych w wielu szablonach", "Dalsza edycja na płótnie A4"]}
                        start="import"
                        plan="standard"
                        cta="Importuj CV"
                    />
                    <PathCard
                        icon={<BlankIcon />}
                        eyebrow="Pełna swoboda"
                        title="Projektuj od zera"
                        text="Pusta strona A4 z tekstami, ikonami, zdjęciami i kształtami. Drag-and-drop oraz swobodne pozycjonowanie bez auto-układu szablonu."
                        bullets={["Dowolne pola i kształty", "Obrazy z galerii i dropzone", "Siatka, wyrównanie, warstwy"]}
                        start="blank"
                        plan="free"
                        cta="Projektuj od zera"
                    />
                </div>
            </section>

            <section className={classes.transformation}>
                <div className={classes.transformationCopy}>
                    <p className={classes.kicker}>Nie tylko galeria ładnych projektów</p>
                    <h2>Twoje dane.<br /><em>Nowa forma.</em></h2>
                    <p>
                        Nie obiecujemy, że AI wymyśli Twoją karierę od zera. Pomagamy przenieść
                        istniejącą treść, znaleźć lepszy układ i poprawić dokument, nad którym nadal masz pełną kontrolę.
                    </p>
                    <div className={classes.transformationPoints}>
                        <span><CheckIcon />Zachowujesz własne doświadczenie</span>
                        <span><CheckIcon />Porównujesz wygląd na prawdziwych danych</span>
                        <span><CheckIcon />Każdą zmianę możesz poprawić ręcznie</span>
                    </div>
                </div>
                <div className={classes.beforeAfter}>
                    <article className={classes.beforeCard}>
                        <div className={classes.documentLabel}><span>PRZED</span> Dotychczasowe CV</div>
                        <div className={classes.oldDocument} aria-hidden="true">
                            <span className={classes.oldTitle} />
                            <span className={classes.oldSubtitle} />
                            <i />
                            <span /><span /><span /><span /><span />
                            <i />
                            <span /><span /><span /><span />
                        </div>
                        <p>Treść trudna do odświeżenia, bez konieczności jej przepisywania.</p>
                    </article>
                    <div className={classes.transformArrow} aria-hidden="true">
                        <span>Twoje dane</span>
                        <ArrowIcon />
                        <span>nowy układ</span>
                    </div>
                    <article className={classes.afterCard}>
                        <div className={classes.documentLabel}><span>PO</span> Wersja w CV Studio</div>
                        <img src="/template-mockups/regent.png" alt="Przykład odświeżonego CV w szablonie Regent" />
                        <p>Nowy szablon, te same informacje i możliwość dalszej edycji.</p>
                    </article>
                </div>
            </section>

            <section id="jak-to-dziala" className={classes.stepsSection}>
                <div className={classes.stepsHeading}>
                    <p className={classes.kicker}>Nowe CV w czterech krokach</p>
                    <h2>Bez ukrytego „magicznego” etapu.</h2>
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

            <section className={classes.editorSection}>
                <div className={classes.editorScreenshot}>
                    <div className={classes.editorCaption}>Edytor CV / A4</div>
                    <img src="/hero-mockup.png" alt="Edytor CV Studio z narzędziami i dokumentem A4" loading="lazy" />
                    <div className={classes.editorPdfBadge}>
                        <CheckIcon />
                        <span><b>Podgląd i PDF</b> korzystają z tej samej geometrii dokumentu.</span>
                    </div>
                </div>
                <div className={classes.editorContent}>
                    <p className={classes.kicker}>Po imporcie albo kreatorze</p>
                    <h2>Edytor jest miejscem, w którym podejmujesz decyzje.</h2>
                    <p className={classes.editorLead}>
                        Przesuwaj tekst, daty, ikony i sekcje bez przebudowywania całego dokumentu.
                        AI może pomóc w analizie, ale nie zmienia stylu dokumentu bez Twojej decyzji.
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

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.templatesHeader}>
                    <div>
                        <p className={classes.kicker}>17 indywidualnych szablonów</p>
                        <h2>Zobacz swoje CV,<br />nie przykładową historię kogoś innego.</h2>
                    </div>
                    <p>Po imporcie lub kreatorze możesz dobierać wygląd do roli, a nie zaczynać od budowania układu od podstaw.</p>
                </div>
                <div className={classes.templateGrid}>
                    {TEMPLATE_PREVIEWS.slice(0, 8).map((template) => (
                        <Link key={template.id} to={wizardUrl} className={classes.templateCard}>
                            <img src={template.image} alt={`Szablon CV ${template.name}`} loading="lazy" />
                            <span><b>{template.name}</b><small>{template.description}</small></span>
                        </Link>
                    ))}
                </div>
                <Link className={classes.templateLink} to={wizardUrl}>Zobacz szablony w edytorze <ArrowIcon /></Link>
            </section>

            <section className={classes.privacySection}>
                <div>
                    <p className={classes.kicker}>Prywatność bez małego druku</p>
                    <h2>CV zawiera dane osobowe. Traktujemy je jak dokument, nie jak materiał marketingowy.</h2>
                </div>
                <div className={classes.privacyCard}>
                    <p>
                        Przesłany plik służy do przygotowania dokumentu oraz działań, które wybierzesz w edytorze.
                        Funkcje AI używają treści CV do ekstrakcji danych, analiz i propozycji poprawek.
                    </p>
                    <ul>
                        <li><CheckIcon />Możesz nadal ręcznie poprawiać każdy element dokumentu.</li>
                        <li><CheckIcon />Import PDF i funkcje AI są oznaczone jako działania wymagające planu Standard.</li>
                        <li><CheckIcon />Zasady konta, przechowywania danych i zabezpieczeń opisujemy w aplikacji, bez deklarowania certyfikatów, których nie posiadamy.</li>
                    </ul>
                </div>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker}>Cennik oparty na efekcie</p>
                    <h2>Wybierz sposób pracy, nie liczbę technicznych kredytów.</h2>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Free</p>
                        <p className={classes.planPrice}>0 <small>zł</small></p>
                        <p className={classes.planSummary}>Dla pierwszej wersji CV i poznania edytora.</p>
                        <ul>
                            <li><CheckIcon />Edytor A4 i podgląd</li>
                            <li><CheckIcon />5 szablonów startowych</li>
                            <li><CheckIcon />1 projekt i 3 eksporty miesięcznie</li>
                            <li><CheckIcon />Kreator CV krok po kroku</li>
                        </ul>
                        <StartButton start="wizard" plan="free" secondary>Stwórz CV za darmo</StartButton>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>Najlepszy do modernizacji CV</span>
                        <p className={classes.planName}>Standard</p>
                        <p className={classes.planPrice}>29 <small>zł / mies.</small></p>
                        <p className={classes.planSummary}>Dla osób, które chcą przenieść istniejące CV i dopracować je przed wysłaniem.</p>
                        <ul>
                            <li><CheckIcon />Import danych z PDF</li>
                            <li><CheckIcon />Wszystkie 18 szablonów</li>
                            <li><CheckIcon />Analizy AI: CV, projekt, dopasowanie, gramatyka, styl i ATS</li>
                            <li><CheckIcon />Do 10 projektów i 30 eksportów miesięcznie</li>
                        </ul>
                        <StartButton start="import" plan="standard">Wgraj moje CV</StartButton>
                    </article>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>Premium</p>
                        <p className={classes.planPrice}>49 <small>zł / mies.</small></p>
                        <p className={classes.planSummary}>Dla wielu wersji CV przygotowywanych pod różne role i oferty.</p>
                        <ul>
                            <li><CheckIcon />Tryb Układ AI: odstępy, wyrównanie i kolizje</li>
                            <li><CheckIcon />Wszystkie 18 szablonów</li>
                            <li><CheckIcon />Bez limitu projektów i eksportów</li>
                            <li><CheckIcon />Wiele wersji CV pod aplikacje</li>
                        </ul>
                        <Link className={classes.buttonSecondary} to="/register?plan=premium">Wybierz Premium <ArrowIcon /></Link>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker}>Najczęstsze pytania</p>
                    <h2>Zanim zaczniesz.</h2>
                </div>
                <div className={classes.faqList}>
                    <details open>
                        <summary>Czy muszę przepisywać swoje obecne CV?</summary>
                        <p>Nie. W planie Standard możesz przesłać PDF, wyodrębnić jego dane i wypełnić nimi wybrany szablon. Po imporcie sprawdzasz i edytujesz wynik na płótnie A4.</p>
                    </details>
                    <details>
                        <summary>Co dokładnie robi AI w planie Standard?</summary>
                        <p>Standard obejmuje ocenę CV i projektu, dopasowanie do oferty, gramatykę, styl, ulepszanie opisów, wskazówki ATS oraz zwykły czat. AI pokazuje ocenę, wskazówki albo pojedyncze poprawki — treść dokumentu zmieniasz dopiero po ich zaakceptowaniu.</p>
                    </details>
                    <details>
                        <summary>Co robi tryb „Układ” i dlaczego wymaga Premium?</summary>
                        <p>Tryb Układ analizuje pełną geometrię wielostronicowego CV: odstępy, wyrównanie, kolizje i rytm sekcji. Pokazuje podgląd proponowanych przesunięć przed zastosowaniem zmian. To funkcja dostępna wyłącznie w Premium, ponieważ wykorzystuje oddzielną analizę całego płótna A4.</p>
                    </details>
                    <details>
                        <summary>Czy AI samo zmienia moje CV?</summary>
                        <p>Nie. Poprawki tekstu, sugestie struktury i propozycje Układu trafiają najpierw do podglądu lub karty decyzji. Możesz zastosować pojedynczą zmianę, odrzucić ją albo dalej edytować dokument ręcznie.</p>
                    </details>
                    <details>
                        <summary>Co jeśli nie mam jeszcze CV?</summary>
                        <p>Wybierz Kreator CV krok po kroku. Poprowadzi przez dane osobowe, doświadczenie, edukację i umiejętności, po czym przejdziesz do wyboru szablonu.</p>
                    </details>
                    <details>
                        <summary>Czy PDF wygląda tak jak podgląd?</summary>
                        <p>Eksport wykorzystuje ten sam model dokumentu, geometrię i czcionki co płótno. Dzięki temu zmiana zoomu nie wpływa na układ gotowego PDF.</p>
                    </details>
                    <details>
                        <summary>Czy wynik ATS gwarantuje odpowiedź od rekrutera?</summary>
                        <p>Nie. Analiza ATS podaje wskazówki dotyczące czytelności struktury i treści. Nie zastępuje wymagań konkretnej oferty ani decyzji rekrutera.</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta}>
                <p className={classes.kicker}>Zacznij od dokumentu, który już masz</p>
                <h2>Odśwież swoje CV<br />bez zaczynania od zera.</h2>
                <p>Wgraj PDF, wybierz nowy układ, sprawdź szczegóły i pobierz wersję gotową do wysłania.</p>
                <Link className={classes.buttonPrimary} to={importUrl}>Wgraj moje CV <ArrowIcon /></Link>
            </section>

            <footer className={classes.footer}>
                <a className={classes.brand} href="#top" aria-label="CV Studio — strona główna">
                    <img src="/cv-studio-logo.svg" alt="" />
                </a>
                <div>
                    <a href="#jak-to-dziala">Jak to działa</a>
                    <a href="#szablony">Szablony</a>
                    <a href="#cennik">Cennik</a>
                    <Link to="/login">Zaloguj się</Link>
                </div>
                <small>© 2026 CV Studio</small>
            </footer>
        </main>
    );
}
