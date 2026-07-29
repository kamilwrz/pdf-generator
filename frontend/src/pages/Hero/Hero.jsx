/**
 * Marketing landing page. Template mockups are static assets so the grid works
 * even when the API is asleep. Soft-wakes the backend on mount for returning users.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import { wakeBackend } from "../../services/api";

const HEADING_TEXT = "CV, które dobrze wygląda i jeszcze lepiej Cię przedstawia";
const ACCENT_WORD = "jeszcze lepiej Cię przedstawia";
const TYPE_SPEED_MS = 55;

// Pre-rendered full-page crops in frontend/public/template-mockups/, one per
// template id — bundled as static assets so this grid never depends on the
// backend being reachable.
const TEMPLATE_PREVIEWS = TEMPLATES.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    industry: tpl.industry,
    image: `/template-mockups/${tpl.id}.png`,
}));

// Funkcje panels. Order + accent colour drive the bullet nav and each eyebrow.
const PANELS = [
    { label: "Płótno", color: "#6C9BE6" },
    { label: "Szablony", color: "#E5A65C" },
    { label: "AI", color: "#E88A73" },
    { label: "Eksport", color: "#6FBF8E" },
    { label: "Konto", color: "#6C9BE6" },
];

const COLLECTIONS = [
    { name: "Finanse", color: "#6C9BE6", items: ["Ledger", "Nimbus", "Cinder", "Rift"], character: "Od instytucjonalnego spokoju po odważną redakcję." },
    { name: "IT", color: "#7FB8C9", items: ["Vector", "Kernel", "Relay", "Lattice"], character: "Platformy, architektura, DevOps, produkt cyfrowy." },
    { name: "Classic", color: "#E5A65C", items: ["Scribe", "Regent", "Aldine", "Merit"], character: "Formalny, executive, szlachetny papier, dyplomatyczny minimalizm." },
    { name: "Sidebar", color: "#6FBF8E", items: ["Quarry", "Moss", "Garnet", "Harbor"], character: "Nocny system, botanika, art déco, morski klimat." },
    { name: "Banking", color: "#9C8FD6", items: ["Vault", "Clearing", "Herald", "Signal"], character: "Private banking, operacje, wealth, ryzyko i treasury." },
    { name: "Dark", color: "#E88A73", items: ["Obsidian", "Raven", "Graphite", "Onyx"], character: "Panel boczny, pasek górny, minimal, rama dyplomatyczna." },
];

const ANALYSES = [
    { n: "01", title: "Oceń CV", desc: "ogólna ocena 1–10" },
    { n: "02", title: "Projekt", desc: "krytyka wizualna" },
    { n: "03", title: "Dopasowanie", desc: "wklej ogłoszenie" },
    { n: "04", title: "Gramatyka", desc: "poprawność językowa" },
    { n: "05", title: "Styl", desc: "ton i klarowność" },
    { n: "06", title: "Ulepsz", desc: "mocniejsze bullety" },
    { n: "07", title: "Wynik ATS", desc: "czytelność dla systemów" },
    { n: "08", title: "Układ", desc: "wyrównanie i odstępy" },
];

// Płótno panel: headline stats strip.
const CANVAS_STATS = [
    { num: "1:1", label: "płótno = PDF", stripe: "linear-gradient(90deg,#6C9BE6,#E5A65C)" },
    { num: "25–300%", label: "zoom bez utraty geometrii", stripe: "#6C9BE6" },
    { num: "8", label: "typów elementów na stronie", stripe: "#E5A65C" },
    { num: "0 kroków", label: "do stracenia — autozapis", stripe: "#6FBF8E" },
];

// Płótno panel: flip cards. Front = the feature; back ("Co dokładnie dostajesz")
// = the concrete controls you actually get. Click or Enter/Space to flip.
const CANVAS_CARDS = [
    {
        color: "#6C9BE6", tint: "rgba(108,155,230,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7BA6EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M9 4v16" /></svg>,
        title: "Tekst i akapity",
        desc: "Jednoliniowe tytuły i wielowierszowe bloki, które same się przelewają przy zmianie szerokości.",
        backTitle: "Typografia jak w studiu DTP",
        bullets: ["Font, rozmiar i kolor tekstu", "Pogrubienie, kursywa, podkreślenie", "Wyrównanie, interlinia, odstępy liter", "Ten sam font w edytorze i w PDF"],
        note: "Nagłówek sekcji ustawiasz raz — reszta CV trzyma rytm.",
    },
    {
        color: "#E5A65C", tint: "rgba(229,166,92,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E5A65C" strokeWidth="1.9"><ellipse cx="12" cy="12" rx="9" ry="5.5" /><rect x="7" y="7" width="10" height="10" /></svg>,
        title: "Kształty i linie",
        desc: "Prostokąty, koła, elipsy i linie — wypełnienie albo obrys, z pełną kontrolą krawędzi.",
        backTitle: "Własny system wizualny, nie szablon nr 3",
        bullets: ["Wypełnienie lub obrys, grubość krawędzi", "Kolor krawędzi i wypełnienia", "Subtelne akcenty: osie, ramki, podziały", "Precyzyjne wyrównanie na siatce A4"],
        note: "Kilka linii potrafi zrobić z CV dokument, który się zapamiętuje.",
    },
    {
        color: "#7FB8C9", tint: "rgba(127,184,201,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7FB8C9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
        title: "Obrazy i galeria",
        desc: "Wgraj zdjęcie i logo raz — używaj ich w każdym projekcie, bez ponownego uploadu.",
        backTitle: "Zdjęcie dokładnie tam, gdzie chcesz",
        bullets: ["Galeria obrazów przypisana do konta", "Proporcje zachowane przy skalowaniu", "Dowolna pozycja i warstwa na stronie", "Ten sam plik trafia do eksportu"],
        note: "Jedno dobre zdjęcie działa w 24 szablonach.",
    },
    {
        color: "#E88A73", tint: "rgba(232,138,115,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E88A73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
        title: "Prowadnice co do piksela",
        desc: "Pomarańczowe markery pokazują dokładny odstęp między krawędziami — koniec zgadywania.",
        backTitle: "Układ, którego nie musisz zgadywać",
        bullets: ["Prowadnice wyrównania podczas przeciągania", "Markery z odstępem w pikselach", "Wyrównanie do strony: lewo / środek / prawo", "Zoom 25–300% do pracy nad detalem"],
        note: "Rekruter nie wie, czym jest kerning. Widzi tylko, że to porządny dokument.",
    },
    {
        color: "#9C8FD6", tint: "rgba(156,143,214,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9C8FD6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
        title: "Pracuj jak projektant",
        desc: "Zaznaczaj wiele elementów, przesuwaj grupę, duplikuj i blokuj to, co ma zostać na miejscu.",
        backTitle: "Panujesz nad każdym blokiem",
        bullets: ["Wielokrotne zaznaczenie Ctrl / Cmd", "Przesuwanie grupy, duplikowanie, usuwanie", "Blokada elementów, których nie ruszasz", "Kolejność warstw (z-index)"],
        note: "Zmiana układu całej sekcji to jedno przeciągnięcie, nie godzina pracy.",
    },
    {
        color: "#6FBF8E", tint: "rgba(111,191,142,.14)",
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6FBF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
        title: "Zachowaj rytm pracy",
        desc: "Cofnij, ponów, autozapis. Wychodzisz w połowie zdania i wracasz do tego samego miejsca.",
        backTitle: "Nic nie przepada",
        bullets: ["Cofnij / ponów w ramach sesji", "Autozapis po chwili bez edycji", "Dodawanie, klonowanie i kolejność stron", "Powiadomienie, gdy PDF jest gotowy"],
        note: "CV powstaje w przerwach — edytor to rozumie.",
    },
];

// Testimonials: bento grid. `span` = how many of the 6 grid columns the card
// fills (2 or 3); `featured` swaps in the larger gradient card treatment.
const TESTIMONIALS = [
    { text: "„Zbudowałam CV w niecałe 20 minut i od razu widziałam, jak wygląda gotowy PDF. Dostałam odpowiedź z trzech firm w tym samym tygodniu.”", name: "Marta K.", role: "Specjalistka ds. marketingu", color: "#6C9BE6", span: 3, featured: true },
    { text: "„Analiza CV wychwyciła braki, których sam bym nie zauważył — brakujące słowa kluczowe, za długie akapity. Poprawiłem i poczułem różnicę.”", name: "Tomasz W.", role: "Inżynier oprogramowania", color: "#E88A73", span: 3, featured: true },
    { text: "„Wgrałam stare CV z Worda — AI w minutę wyciągnęło doświadczenie i wykształcenie, resztę tylko dopracowałam w nowym szablonie.”", name: "Katarzyna N.", role: "Kierowniczka projektu", color: "#E5A65C", span: 2, featured: false },
    { text: "„Sprawdziłem wynik ATS przed wysłaniem zgłoszenia i podniosłem go z 62 do 91 punktów jednym kliknięciem.”", name: "Piotr Z.", role: "Analityk finansowy", color: "#7FB8C9", span: 2, featured: false },
    { text: "„Kreator krok po kroku poprowadził mnie przez całe CV, a szkic zapisywał się sam — wróciłam do niego trzy dni później.”", name: "Julia S.", role: "Absolwentka studiów", color: "#9C8FD6", span: 2, featured: false },
    { text: "„W końcu narzędzie, w którym CV wygląda równie dobrze na ekranie i po wydrukowaniu. Szablon Regent zrobił świetne wrażenie na rekrutacji.”", name: "Aleksandra P.", role: "Absolwentka prawa", color: "#6FBF8E", span: 3, featured: false },
    { text: "„Prowadnice co do piksela sprawiły, że mój układ wygląda, jakby robiła go agencja graficzna, a nie ja sam.”", name: "Michał R.", role: "Projektant UX", color: "#6C9BE6", span: 3, featured: false },
    { text: "„Wybrałam szablon z kolekcji Banking — pasował dokładnie do mojej branży i wyglądał poważnie od pierwszego wejrzenia.”", name: "Natalia K.", role: "Specjalistka ds. sprzedaży", color: "#E88A73", span: 3, featured: false },
    { text: "„Zacząłem za darmo, bez karty. Cofnij, ponów i autozapis dały mi spokój — nic nie zniknęło w połowie edycji.”", name: "Dawid M.", role: "Specjalista obsługi klienta", color: "#6FBF8E", span: 3, featured: false },
];

// Reveals its element once it crosses 15% into the viewport, then stops
// observing — matches the one-shot IntersectionObserver reveal pattern.
function useInView(threshold = 0.15) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                    observer.unobserve(node);
                }
            },
            { threshold },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [threshold]);

    return [ref, inView];
}

function TestimonialCard({ item, index }) {
    const [ref, inView] = useInView();
    const quoteSize = item.featured ? 30 : 24;
    const spanClass = item.span === 2 ? classes.tSpan2 : classes.tSpan3;
    const cardClass = [
        classes.testimonialCard,
        item.featured ? classes.testimonialFeatured : "",
        spanClass,
        inView ? classes.testimonialCardVisible : "",
    ].filter(Boolean).join(" ");

    return (
        <div ref={ref} className={cardClass} style={{ transitionDelay: `${index * 70}ms` }}>
            <svg
                className={classes.testimonialQuote}
                width={quoteSize}
                height={quoteSize}
                viewBox="0 0 24 24"
                fill={item.color}
                opacity="0.9"
                aria-hidden="true"
            >
                <path d="M9.5 6C6.5 6 4 8.7 4 12.2c0 3 1.9 5 4.4 5 1.9 0 3.4-1.4 3.4-3.3 0-1.8-1.3-3.1-3-3.1-.3 0-.6 0-.8.1.3-2 2-3.5 4.2-3.7L11.8 6H9.5zm10 0c-3 0-5.5 2.7-5.5 6.2 0 3 1.9 5 4.4 5 1.9 0 3.4-1.4 3.4-3.3 0-1.8-1.3-3.1-3-3.1-.3 0-.6 0-.8.1.3-2 2-3.5 4.2-3.7L21.8 6h-2.3z" />
            </svg>
            <p className={item.featured ? classes.testimonialTextFeatured : classes.testimonialText}>{item.text}</p>
            <div className={classes.testimonialAuthor}>
                <span className={classes.testimonialAvatar} style={{ background: item.color }} />
                <div>
                    <div className={classes.testimonialName}>{item.name}</div>
                    <div className={classes.testimonialRole}>{item.role}</div>
                </div>
            </div>
        </div>
    );
}

function CanvasFlipCard({ card, flipped, onToggle }) {
    const handleKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
        }
    };
    return (
        <div
            className={classes.flipCard}
            role="button"
            tabIndex={0}
            aria-pressed={flipped}
            aria-label={`${card.title} — odwróć kartę`}
            onClick={onToggle}
            onKeyDown={handleKeyDown}
        >
            <div className={`${classes.flipInner} ${flipped ? classes.flipped : ""}`}>
                <div className={`${classes.flipFace} ${classes.flipFront}`}>
                    <span className={classes.flipStripe} style={{ background: card.color }} />
                    <div className={classes.flipBody}>
                        <span className={classes.flipIcon} style={{ background: card.tint }}>{card.icon}</span>
                        <h3 className={classes.flipH3}>{card.title}</h3>
                        <p className={classes.flipDesc}>{card.desc}</p>
                        <span className={classes.flipHint}>
                            Odwróć kartę
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E7887" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                        </span>
                    </div>
                </div>
                <div className={`${classes.flipFace} ${classes.flipBack}`}>
                    <span className={classes.flipStripe} style={{ background: card.color }} />
                    <div className={classes.flipBackBody}>
                        <span className={classes.flipEyebrow} style={{ color: card.color }}>Co dokładnie dostajesz</span>
                        <h3 className={classes.flipBackH3}>{card.backTitle}</h3>
                        <div className={classes.flipBullets}>
                            {card.bullets.map((b) => (
                                <span className={classes.flipBullet} key={b}>
                                    <span className={classes.flipDot} style={{ background: card.color }} />
                                    {b}
                                </span>
                            ))}
                        </div>
                        <span className={classes.flipNote}>{card.note}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FeatureCard({ stripe, tint, icon, title, text, span }) {
    return (
        <div className={`${classes.card} ${span ? classes.cardSpan2 : ""}`}>
            <span className={classes.cardStripe} style={{ background: stripe }} />
            <div className={classes.cardBody}>
                <span className={classes.cardIcon} style={{ background: tint }}>{icon}</span>
                <h3 className={classes.cardH3}>{title}</h3>
                <p className={classes.cardP}>{text}</p>
            </div>
        </div>
    );
}

function TemplatePreviewModal({ template, onClose }) {
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape") onClose();
        };
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    if (!template) return null;

    return createPortal(
        <div
            className={classes.previewBackdrop}
            role="presentation"
            onClick={onClose}
        >
            <div
                className={classes.previewModal}
                role="dialog"
                aria-modal="true"
                aria-label={`Podgląd szablonu ${template.name}`}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    className={classes.previewClose}
                    onClick={onClose}
                    aria-label="Zamknij podgląd"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
                <div className={classes.previewMeta}>
                    <div>
                        <div className={classes.previewName}>{template.name}</div>
                        <div className={classes.previewIndustry}>{template.industry}</div>
                    </div>
                    <Link to="/register" className={classes.previewCta}>
                        Użyj tego szablonu
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                    </Link>
                </div>
                <div className={classes.previewPaper}>
                    <img src={template.image} alt={`Szablon ${template.name}`} />
                </div>
            </div>
        </div>,
        document.body,
    );
}

function TemplatesMarquee({ templates, onSelect, paused }) {
    const renderCards = (suffix) => templates.map((tpl) => (
        <button
            type="button"
            key={`${tpl.id}-${suffix}`}
            className={classes.templateCard}
            onClick={() => onSelect(tpl)}
            aria-label={`Podgląd szablonu ${tpl.name}`}
        >
            <div className={classes.templateThumb}>
                <img src={tpl.image} alt="" loading="lazy" />
            </div>
            <div className={classes.templateInfo}>
                <div className={classes.templateName}>{tpl.name}</div>
                <div className={classes.templateMeta}>{tpl.industry}</div>
            </div>
        </button>
    ));

    return (
        <div className={`${classes.marquee} ${paused ? classes.marqueePaused : ""}`}>
            <div className={classes.marqueeTrack}>
                <div className={classes.marqueeGroup}>{renderCards("a")}</div>
                <div className={classes.marqueeGroup} aria-hidden="true">{renderCards("b")}</div>
            </div>
        </div>
    );
}

// Types `text` out one character at a time. Starts fully typed when the user
// prefers reduced motion, so there is no flash of an empty heading to animate away.
function useTypewriter(text, speed) {
    const [typedCount, setTypedCount] = useState(() => (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? text.length : 0
    ));

    useEffect(() => {
        if (typedCount >= text.length) return undefined;
        const timer = setInterval(() => {
            setTypedCount((count) => {
                const next = count + 1;
                if (next >= text.length) clearInterval(timer);
                return Math.min(next, text.length);
            });
        }, speed);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; re-keys on text/speed change only
    }, [text, speed]);

    return typedCount;
}

export default function Hero() {
    const [panel, setPanel] = useState(0);
    const [flipped, setFlipped] = useState({});
    const [previewTemplate, setPreviewTemplate] = useState(null);
    const toggleFlip = (i) => setFlipped((f) => ({ ...f, [i]: !f[i] }));

    useEffect(() => {
        wakeBackend();
    }, []);

    const typedCount = useTypewriter(HEADING_TEXT, TYPE_SPEED_MS);
    const typingDone = typedCount >= HEADING_TEXT.length;
    const accentStart = HEADING_TEXT.indexOf(ACCENT_WORD);
    const revealed = HEADING_TEXT.slice(0, typedCount);
    const hasAccent = accentStart >= 0;
    const accentEnd = hasAccent ? accentStart + ACCENT_WORD.length : -1;
    const preText = hasAccent
        ? revealed.slice(0, Math.min(accentStart, typedCount))
        : revealed;
    const accentText = hasAccent
        ? revealed.slice(Math.min(accentStart, typedCount), Math.min(accentEnd, typedCount))
        : "";
    const postText = hasAccent
        ? revealed.slice(Math.min(accentEnd, typedCount))
        : "";

    return (
        <div className={classes.page}>
            <div className={`${classes.blob} ${classes.blobBlue}`} aria-hidden="true" />
            <div className={`${classes.blob} ${classes.blobAmber}`} aria-hidden="true" />

            {/* First viewport: topbar + hero = 100vh */}
            <div className={classes.heroStage}>
                <div className={classes.heroPhoto} aria-hidden="true">
                    <img src="/men.png" alt="" />
                </div>
                <div className={classes.heroScrim} aria-hidden="true" />

                <nav className={classes.nav}>
                    <div className={classes.brand}>
                        <span className={classes.brandMark}><img src="/kompoza-logo2.png" alt="" /></span>
                        <span className={classes.brandName}>CV STUDIO</span>
                    </div>
                    <div className={classes.navLinks}>
                        <a href="#funkcje" className={`${classes.navLink} ${classes.navLinkActive}`}>Funkcje</a>
                        <a href="#cennik" className={classes.navLink}>Cennik</a>
                        <a href="#szablony" className={classes.navLink}>Szablony</a>
                        <Link to="/login" className={classes.navLink}>Zaloguj się</Link>
                        <Link to="/register" className={classes.navCta}>Rozpocznij za darmo</Link>
                    </div>
                </nav>

                <div className={classes.hero}>
                    <div className={classes.heroInner}>
                        <h1 className={classes.heading} aria-label={HEADING_TEXT}>
                            <span aria-hidden="true">
                                {preText}
                                <span className={classes.accentWord}>{accentText}</span>
                                {postText}
                                {!typingDone && <span className={classes.cursor}>|</span>}
                            </span>
                        </h1>
                        <p className={`${classes.subheading} ${typingDone ? classes.revealed : ""}`}>
                            24 szablony branżowe, intuicyjny edytor A4 i AI, które pomoże Ci opisać doświadczenie. Od pustej strony do gotowej aplikacji.
                        </p>
                        <div className={`${classes.ctaRow} ${typingDone ? classes.revealed : ""}`}>
                            <Link to="/register" className={classes.primaryCta}>
                                Zacznij projektować
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                            </Link>
                            <a href="#funkcje" className={classes.secondaryCta}>
                                Zobacz, jak działa
                            </a>
                        </div>
                    </div>

                    {/* Decorative product mockup filling the empty right-hand space */}
                    <div className={classes.heroVisual} aria-hidden="true">
                        <div className={classes.window}>
                            <div className={classes.windowBar}>
                                <span className={classes.dot} style={{ background: "#E88A73" }} />
                                <span className={classes.dot} style={{ background: "#E5A65C" }} />
                                <span className={classes.dot} style={{ background: "#6FBF8E" }} />
                                <span className={classes.windowFile}>cv-regent.pdf</span>
                            </div>
                            <div className={classes.windowBody}>
                                <div className={classes.windowRail}>
                                    <div className={classes.railActive} />
                                    <div className={classes.railItem} />
                                    <div className={classes.railItem} />
                                    <div className={classes.railItem} />
                                </div>
                                <div className={classes.windowCanvas}>
                                    <div className={classes.miniPage}>
                                        <div className={classes.miniBanner} />
                                        <div className={classes.miniLine} style={{ width: "82%" }} />
                                        <div className={classes.miniLineSm} style={{ width: "60%" }} />
                                        <div className={classes.miniBar} style={{ width: "100%" }} />
                                        <div className={classes.miniBar} style={{ width: "92%" }} />
                                        <div className={classes.miniBar} style={{ width: "96%" }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={classes.floatCard}>
                            <span className={classes.floatIcon}>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6FBF8E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            </span>
                            <div>
                                <div className={classes.floatTitle}>PDF gotowy</div>
                                <div className={classes.floatSub}>248 kB · 2 strony</div>
                            </div>
                        </div>

                        <div className={classes.floatBadge}>
                            <span className={classes.floatBadgeDot} />
                            <div className={classes.floatBadgeText}>Wynik ATS <span className={classes.floatBadgeNum}>94</span></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ---- Funkcje: one panel at a time, switched by section bullets ---- */}
            <div id="funkcje" className={classes.funkcje}>
                <nav className={classes.dots} aria-label="Sekcje funkcji">
                    {PANELS.map((p, index) => (
                        <button
                            type="button"
                            key={p.label}
                            className={`${classes.dotNav} ${index === panel ? classes.dotNavActive : ""}`}
                            onClick={() => setPanel(index)}
                            aria-current={index === panel ? "true" : undefined}
                        >
                            <span className={classes.dotLabel}>{p.label}</span>
                            <span
                                className={classes.dotMark}
                                style={{ background: index === panel ? p.color : "#3A4048" }}
                            />
                        </button>
                    ))}
                </nav>

                <div className={classes.panelStage}>
                    {/* 01 — Płótno */}
                    <section
                        className={`${classes.panel} ${classes.panelCanvas}`}
                        hidden={panel !== 0}
                        aria-hidden={panel !== 0}
                    >
                        <div className={classes.panelInner}>
                            <div className={classes.panelHead}>
                                <div className={classes.panelHeadCopy}>
                                    <span className={classes.eyebrowRow} style={{ color: "#7BA6EA" }}>01 — Wizualny edytor na płótnie</span>
                                    <h2 className={classes.panelTitle}>Płótno, które robi to, co Word obiecywał</h2>
                                    <p className={classes.panelLead}>Prawdziwa strona A4 — pion lub poziom, wiele stron, zoom 25–300%. Przeciągasz, wyrównujesz i stylizujesz każdy blok, a eksport wygląda dokładnie tak jak płótno. Odwróć kartę, żeby zobaczyć, co dokładnie dostajesz.</p>
                                </div>
                                <div className={classes.pills}>
                                    <span className={classes.pill}>A4 pion i poziom</span>
                                    <span className={classes.pill}>Wiele stron</span>
                                    <span className={classes.pill}>Zoom 25–300%</span>
                                    <span className={classes.pill}>Widok dwóch stron</span>
                                </div>
                            </div>

                            <div className={classes.canvasStats}>
                                {CANVAS_STATS.map((stat) => (
                                    <div className={classes.statCard} key={stat.label}>
                                        <span className={classes.statStripe} style={{ background: stat.stripe }} />
                                        <div className={classes.statBody}>
                                            <div className={classes.statNum}>{stat.num}</div>
                                            <div className={classes.statLabel}>{stat.label}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className={classes.flipGrid}>
                                {CANVAS_CARDS.map((card, i) => (
                                    <CanvasFlipCard
                                        key={card.title}
                                        card={card}
                                        flipped={!!flipped[i]}
                                        onToggle={() => toggleFlip(i)}
                                    />
                                ))}
                            </div>

                            <div className={classes.canvasFooter}>
                                <p className={classes.canvasFooterText}>To, co widzisz na płótnie, trafia do eksportu — bez uproszczeń, bez „prawie tak samo”.</p>
                                <Link to="/register" className={classes.canvasFooterCta}>
                                    Zacznij projektować
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* 02 — Szablony */}
                    <section
                        className={`${classes.panel} ${classes.panelTemplates}`}
                        hidden={panel !== 1}
                        aria-hidden={panel !== 1}
                    >
                        <div className={classes.panelInner}>
                            <div className={classes.panelHead}>
                                <div className={classes.panelHeadCopy}>
                                    <span className={classes.eyebrowRow} style={{ color: "#E5A65C" }}>02 — Biblioteka szablonów</span>
                                    <h2 className={classes.panelTitle}>24 systemy CV, nie generyczne „CV nr 3”</h2>
                                    <p className={classes.panelLead}>Każdy szablon to A4 pion i realna kariera. Wybierz wygląd pod rolę, na którą aplikujesz — i uczyń go swoim.</p>
                                </div>
                                <div className={classes.bigStat}>
                                    <div className={classes.bigStatNum}>24</div>
                                    <div className={classes.bigStatLabel}>gotowe układy</div>
                                </div>
                            </div>

                            <div className={classes.collectionGrid}>
                                {COLLECTIONS.map((col) => (
                                    <div className={classes.card} key={col.name}>
                                        <span className={classes.cardStripe} style={{ background: col.color }} />
                                        <div className={classes.cardBody}>
                                            <div className={classes.collectionTop}>
                                                <h3 className={classes.cardH3}>{col.name}</h3>
                                                <span className={classes.collectionCount}>4 szablony</span>
                                            </div>
                                            <div className={classes.chips}>
                                                {col.items.map((tpl) => (
                                                    <span className={classes.chip} key={tpl}>{tpl}</span>
                                                ))}
                                            </div>
                                            <p className={classes.collectionChar}>{col.character}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 03 — AI */}
                    <section
                        className={`${classes.panel} ${classes.panelAi}`}
                        hidden={panel !== 2}
                        aria-hidden={panel !== 2}
                    >
                        <div className={classes.panelInner}>
                            <div className={classes.panelHeadStack}>
                                <span className={classes.eyebrowRow} style={{ color: "#E88A73" }}>03 — Asystent AI</span>
                                <h2 className={classes.panelTitle}>Coach kariery na płótnie</h2>
                                <p className={classes.panelLead}>Pływający asystent, który rozumie dokument, który właśnie edytujesz — od importu starego PDF po ocenę ATS.</p>
                            </div>

                            <div className={classes.aiRow}>
                                <div className={classes.aiLeft}>
                                    <FeatureCard
                                        stripe="#6C9BE6" tint="rgba(108,155,230,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7BA6EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>}
                                        title="Wypełnij z PDF"
                                        text="Prześlij istniejące CV — CV STUDIO wyciąga imię, stanowisko, doświadczenie, wykształcenie i umiejętności, a potem wlewa je do dowolnego szablonu. Bez ponownego uploadu."
                                    />
                                    <FeatureCard
                                        stripe="#E5A65C" tint="rgba(229,166,92,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E5A65C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M9 4v16" /></svg>}
                                        title="Kreator krok po kroku"
                                        text="Dane osobowe, doświadczenie, wykształcenie, umiejętności, języki, własne sekcje i podsumowanie. Szkic zapisuje się automatycznie — wyjdź i wróć."
                                    />
                                    <div className={`${classes.card} ${classes.cardSpan2}`}>
                                        <span className={classes.cardStripe} style={{ background: "#E88A73" }} />
                                        <div className={classes.cardBody}>
                                            <div className={classes.analysesHead}>
                                                <h3 className={classes.cardH3}>Osiem szybkich analiz</h3>
                                                <span className={classes.analysesNote}>jedno kliknięcie w asystencie</span>
                                            </div>
                                            <div className={classes.analysesGrid}>
                                                {ANALYSES.map((a) => (
                                                    <div className={classes.analysis} key={a.n}>
                                                        <span className={classes.analysisNum}>{a.n}</span>
                                                        <div>
                                                            <div className={classes.analysisTitle}>{a.title}</div>
                                                            <div className={classes.analysisDesc}>{a.desc}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={classes.aiRight}>
                                    <div className={classes.chatCard}>
                                        <span className={classes.mockStripe} style={{ background: "linear-gradient(90deg,#E88A73,#6C9BE6)" }} />
                                        <div className={classes.chatHead}>
                                            <span className={classes.chatStatus} />
                                            <span className={classes.chatTitle}>Asystent CV STUDIO</span>
                                        </div>
                                        <div className={classes.chatBody}>
                                            <div className={classes.chatUser}>Skróć bullet points w ostatniej roli i wzmocnij czasowniki.</div>
                                            <div className={classes.chatBot}>Proponuję 3 zmiany w sekcji <span className={classes.chatAccent}>Doświadczenie</span>. Zaakceptuj lub odrzuć każdą osobno.</div>
                                            <div className={classes.chatActions}>
                                                <div className={classes.chatRow}>
                                                    <span className={classes.chatRowLabel}>Bullet 1 · wysoka istotność</span>
                                                    <span className={classes.chatRowBtns}>
                                                        <span className={classes.chatAccept}>Przyjmij</span>
                                                        <span className={classes.chatReject}>Odrzuć</span>
                                                    </span>
                                                </div>
                                                <div className={classes.chatRow}>
                                                    <span className={classes.chatRowLabel}>Przesunięcie layoutu · 4 elementy</span>
                                                    <span className={classes.chatPreview}>Podgląd</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={classes.card}>
                                        <span className={classes.cardStripe} style={{ background: "#6FBF8E" }} />
                                        <div className={classes.cardBody}>
                                            <h3 className={classes.cardH3}>Edycja w rozmowie</h3>
                                            <p className={classes.cardP}>Pisz naturalnym językiem. Akceptuj lub odrzucaj poprawki per element, podglądaj grupy przesunięć layoutu, przebudowuj strukturę albo usuwaj słabe bloki — z oznaczeniem istotności, żebyś Ty miał kontrolę.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 04 — Eksport */}
                    <section
                        className={`${classes.panel} ${classes.panelExport}`}
                        hidden={panel !== 3}
                        aria-hidden={panel !== 3}
                    >
                        <div className={classes.panelInner}>
                            <div className={classes.panelHeadStack}>
                                <span className={classes.eyebrowRow} style={{ color: "#6FBF8E" }}>04 — Eksport wierny płótnu</span>
                                <h2 className={classes.panelTitle}>PDF wygląda jak strona, którą zaprojektowałeś</h2>
                                <p className={classes.panelLead}>Nie uproszczona kopia. Renderowanie po stronie serwera z dokładnego modelu elementów płótna.</p>
                            </div>

                            <div className={classes.exportGrid}>
                                <FeatureCard stripe="#6FBF8E" title="Serwerowy render" text="PDF z dokładnego modelu elementów — geometria jeden do jednego." />
                                <FeatureCard stripe="#6C9BE6" title="Zsynchronizowane fonty" text="Inter, Roboto, Times, Helvetica i Courier — te same pliki w edytorze i w PDF." />
                                <FeatureCard stripe="#E5A65C" title="Wiele stron" text="Zachowana liczba stron i rozmiar strony. Zoom nigdy nie zniekształca eksportu." />
                                <FeatureCard stripe="#E88A73" title="Pobierz od razu" text="Z powiadomienia o sukcesie albo w każdej chwili z Moje dokumenty." />
                            </div>

                            <div className={classes.exportMocks}>
                                <div className={classes.card}>
                                    <span className={classes.cardStripe} style={{ background: "linear-gradient(90deg,#6FBF8E,#6C9BE6)" }} />
                                    <div className={classes.pdfRow}>
                                        <span className={classes.pdfThumb}><span>PDF</span></span>
                                        <div className={classes.pdfInfo}>
                                            <div className={classes.pdfName}>cv-anna-kowalska.pdf</div>
                                            <div className={classes.pdfMeta}>2 strony · A4 pion · 248 kB</div>
                                            <div className={classes.pdfBar}><span /></div>
                                        </div>
                                        <span className={classes.pdfBtn}>Pobierz</span>
                                    </div>
                                </div>
                                <div className={classes.card}>
                                    <span className={classes.cardStripe} style={{ background: "#6C9BE6" }} />
                                    <div className={classes.fontsRow}>
                                        <span className={classes.fontsLabel}>Fonty w pliku</span>
                                        <span className={classes.fontSample} style={{ fontFamily: "Inter, sans-serif" }}>Inter</span>
                                        <span className={classes.fontSample} style={{ fontFamily: "Roboto, sans-serif" }}>Roboto</span>
                                        <span className={classes.fontSample} style={{ fontFamily: "Georgia, serif" }}>Times</span>
                                        <span className={classes.fontSample} style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>Helvetica</span>
                                        <span className={classes.fontSample} style={{ fontFamily: "'Courier New', monospace" }}>Courier</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 05 — Konto */}
                    <section
                        className={`${classes.panel} ${classes.panelAccount}`}
                        hidden={panel !== 4}
                        aria-hidden={panel !== 4}
                    >
                        <div className={classes.panelInner}>
                            <div className={classes.panelHeadStack}>
                                <span className={classes.eyebrowRow} style={{ color: "#7BA6EA" }}>05 — Konto, język i cennik</span>
                                <h2 className={classes.panelTitle}>Za darmo na start, cały interfejs po polsku</h2>
                                <p className={classes.panelLead}>Załóż konto, projektuj i pobieraj. Karta nie jest wymagana — AI i pełna biblioteka szablonów w planach płatnych.</p>
                            </div>

                            <div className={classes.accountGrid}>
                                <FeatureCard stripe="#6C9BE6" title="Rejestracja i logowanie" text="Login, e-mail i hasło. Na zawsze za darmo, bez karty. Bezpieczna sesja JWT — płótno jest dla zalogowanych twórców." />
                                <FeatureCard stripe="#E5A65C" title="Moje dokumenty" text="Wyszukiwanie i sortowanie (najnowsze, najstarsze, A–Z), otwieranie, pobieranie i usuwanie projektów." />
                                <FeatureCard stripe="#E88A73" title="Galeria obrazów" text="Wgraj obrazy raz i używaj ich w wielu projektach — z zachowaniem proporcji przy zmianie rozmiaru." />
                                <div className={`${classes.card} ${classes.cardSpan2}`}>
                                    <span className={classes.cardStripe} style={{ background: "linear-gradient(90deg,#6C9BE6,#E5A65C)" }} />
                                    <div className={classes.cardBody}>
                                        <h3 className={classes.cardH3}>Najpierw po polsku</h3>
                                        <p className={classes.cardP} style={{ maxWidth: "640px" }}>Cały interfejs mówi po polsku: marketing, edytor, akcje AI, powiadomienia i modale. Zbudowane pod polski rynek pracy — z nagłówkami sekcji i copy, które brzmią naturalnie, a nie jak pośpieszne tłumaczenie.</p>
                                    </div>
                                </div>
                                <div className={`${classes.card} ${classes.priceCard}`}>
                                    <span className={classes.cardStripe} style={{ background: "#6FBF8E" }} />
                                    <div className={classes.priceBody}>
                                        <span className={classes.priceEyebrow}>Plan Free</span>
                                        <div className={classes.priceValue}>0 zł</div>
                                        <p className={classes.cardP}>Edytor, wybrane szablony i eksport PDF. Kredyty AI — w planach Standard i Premium.</p>
                                        <Link to="/register?plan=free" className={classes.priceCta}>
                                            Rozpocznij za darmo
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* ---- Templates: infinite RTL marquee + full-page preview modal ---- */}
            <div id="szablony" className={classes.templatesSection}>
                <div className={classes.sectionHead}>
                    <span className={classes.eyebrow}>Szablony</span>
                    <h2 className={classes.sectionTitle}>Zacznij od gotowego, pięknego szablonu CV</h2>
                </div>
                <TemplatesMarquee
                    templates={TEMPLATE_PREVIEWS}
                    onSelect={setPreviewTemplate}
                    paused={Boolean(previewTemplate)}
                />
            </div>

            {previewTemplate && (
                <TemplatePreviewModal
                    template={previewTemplate}
                    onClose={() => setPreviewTemplate(null)}
                />
            )}

            {/* ---- Testimonials ---- */}
            <div className={classes.testimonialsBand}>
                <div className={classes.testimonialsInner}>
                    <div className={classes.sectionHead}>
                        <span className={classes.eyebrow}>Opinie</span>
                        <h2 className={classes.sectionTitle}>Ludzie, którzy znaleźli pracę z CV STUDIO</h2>
                    </div>
                    <div className={classes.testimonialsGrid}>
                        {TESTIMONIALS.map((item, index) => (
                            <TestimonialCard key={item.name} item={item} index={index} />
                        ))}
                    </div>
                </div>
            </div>

            {/* ---- Cennik ---- */}
            <div id="cennik" className={classes.cennikSection}>
                <div className={classes.sectionHead}>
                    <span className={classes.eyebrow}>Cennik</span>
                    <h2 className={classes.sectionTitle}>Wybierz plan pod swoje aplikacje</h2>
                    <p className={classes.cennikText}>
                        Zacznij za darmo. Odblokuj AI i pełną bibliotekę szablonów, gdy potrzebujesz więcej.
                    </p>
                    <p className={classes.cennikText}>1 kredyt AI ≈ 5 gr — płacisz tylko za realne użycie.</p>
                </div>
                <div className={classes.pricingGrid}>
                    <div className={classes.planCard}>
                        <div className={classes.planName}>Free</div>
                        <div className={classes.planPrice}>
                            <span className={classes.planAmount}>0</span>
                            <span className={classes.planCurrency}>zł</span>
                        </div>
                        <p className={classes.planPeriod}>na zawsze · bez karty</p>
                        <ul className={classes.planFeatures}>
                            <li>Edytor A4 i eksport PDF</li>
                            <li>8 szablonów startowych</li>
                            <li>1 projekt · 3 eksporty / mies.</li>
                            <li className={classes.planMuted}>Bez AI Assistant</li>
                        </ul>
                        <Link to="/register?plan=free" className={classes.planCtaSecondary}>Zacznij za darmo</Link>
                    </div>

                    <div className={`${classes.planCard} ${classes.planFeatured}`}>
                        <span className={classes.planBadge}>Najczęściej wybierany</span>
                        <div className={classes.planName}>Standard</div>
                        <div className={classes.planPrice}>
                            <span className={classes.planAmount}>29</span>
                            <span className={classes.planCurrency}>zł</span>
                        </div>
                        <p className={classes.planPeriod}>miesięcznie · 279 zł / rok</p>
                        <ul className={classes.planFeatures}>
                            <li>Asystent AI — 150 kredytów / mies.</li>
                            <li>Wszystkie 24 szablony</li>
                            <li>Import z PDF i kreator bio</li>
                            <li>10 projektów · 30 eksportów / mies.</li>
                        </ul>
                        <Link to="/register?plan=standard" className={classes.planCtaPrimary}>Wybierz Standard</Link>
                    </div>

                    <div className={classes.planCard}>
                        <div className={classes.planName}>Premium</div>
                        <div className={classes.planPrice}>
                            <span className={classes.planAmount}>49</span>
                            <span className={classes.planCurrency}>zł</span>
                        </div>
                        <p className={classes.planPeriod}>miesięcznie · 469 zł / rok</p>
                        <ul className={classes.planFeatures}>
                            <li>Asystent AI — 300 kredytów / mies.</li>
                            <li>Wszystkie 24 szablony</li>
                            <li>Bez limitu projektów i eksportów</li>
                            <li>Wiele wersji CV pod oferty</li>
                        </ul>
                        <Link to="/register?plan=premium" className={classes.planCtaSecondary}>Wybierz Premium</Link>
                    </div>
                </div>
            </div>

            {/* ---- Final CTA ---- */}
            <div className={classes.finalCta}>
                <h2 className={classes.finalCtaTitle}>Gotowy na CV, które otwiera drzwi?</h2>
                <p className={classes.finalCtaText}>Załóż darmowe konto i wypróbuj pierwszy szablon już dziś.</p>
                <Link to="/register" className={classes.finalCtaBtn}>
                    Rozpocznij za darmo
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                </Link>
            </div>

            {/* ---- Footer ---- */}
            <footer className={classes.footer}>
                <div className={classes.footerTop}>
                    <div className={classes.footerBrand}>
                        <span className={classes.footerBrandMark}><img src="/kompoza-logo2.png" alt="" /></span>
                        <span className={classes.footerBrandName}>CV STUDIO</span>
                    </div>
                    <div className={classes.footerLinks}>
                        <a href="#funkcje" className={classes.footerLink}>Funkcje</a>
                        <a href="#cennik" className={classes.footerLink}>Cennik</a>
                        <a href="#szablony" className={classes.footerLink}>Szablony</a>
                        <Link to="/login" className={classes.footerLink}>Zaloguj się</Link>
                        <Link to="/register" className={classes.footerLinkAccent}>Zarejestruj się</Link>
                    </div>
                </div>
                <div className={classes.footerBottom}>© 2026 CV STUDIO. Wszystkie prawa zastrzeżone.</div>
            </footer>
        </div>
    );
}
