import { useState } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import API_BASE_URL from "../../services/api";

const TEMPLATE_PREVIEWS = [
    { id: "ledger", name: "Ledger", industry: "Finanse · Instytucjonalny", image: `${API_BASE_URL}/template-assets/ledger-finance-accent.png` },
    { id: "vector", name: "Vector", industry: "IT · Sieci i platformy", image: `${API_BASE_URL}/template-assets/vector-it-network.png` },
    { id: "quarry", name: "Quarry", industry: "Sidebar · Nocny system", image: `${API_BASE_URL}/template-assets/quarry-sidebar.png` },
    { id: "garnet", name: "Garnet", industry: "Sidebar · Art déco executive", image: `${API_BASE_URL}/template-assets/garnet-sidebar.png` },
];

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

export default function Hero() {
    const [panel, setPanel] = useState(0);

    return (
        <div className={classes.page}>
            <div className={`${classes.blob} ${classes.blobBlue}`} aria-hidden="true" />
            <div className={`${classes.blob} ${classes.blobAmber}`} aria-hidden="true" />

            {/* First viewport: topbar + hero = 100vh */}
            <div className={classes.heroStage}>
                <nav className={classes.nav}>
                    <div className={classes.brand}>
                        <span className={classes.brandMark}><img src="/kompoza-logo2.png" alt="" /></span>
                        <span className={classes.brandName}>Kompoza</span>
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
                    <div className={classes.heroCopy}>
                        <h1 className={classes.heading}>
                            Twórz <span className={classes.accentWord}>piękne</span> CV w kilka minut.
                        </h1>
                        <p className={classes.subheading}>
                            Wizualne płótno A4, 24 szablony branżowe i AI — od pomysłu do PDF gotowego do wysłania.
                        </p>
                        <div className={classes.ctaRow}>
                            <Link to="/register" className={classes.primaryCta}>
                                Zacznij projektować
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F1216" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                            </Link>
                            <a href="#funkcje" className={classes.secondaryCta}>
                                Zobacz, jak działa
                            </a>
                        </div>
                    </div>

                    <div className={classes.preview}>
                        <img
                            className={classes.mockup}
                            src="/hero-mockup.png"
                            alt="Edytor CV Kompoza — podgląd płótna z szablonem Nimbus"
                            width={1600}
                            height={1000}
                            decoding="async"
                            fetchPriority="high"
                        />
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
                                    <h2 className={classes.panelTitle}>Pełna przestrzeń twórcza na A4</h2>
                                    <p className={classes.panelLead}>Pion lub poziom, wiele stron, zoom 25–300%. To, co widzisz na płótnie, trafia do eksportu — bez uproszczeń.</p>
                                </div>
                                <div className={classes.pills}>
                                    <span className={classes.pill}>A4 pion i poziom</span>
                                    <span className={classes.pill}>Wiele stron</span>
                                    <span className={classes.pill}>Zoom 25–300%</span>
                                </div>
                            </div>

                            <div className={classes.canvasRow}>
                                <div className={classes.mockCard}>
                                    <span className={classes.mockStripe} style={{ background: "linear-gradient(90deg,#6C9BE6,#E5A65C)" }} />
                                    <div className={classes.mockHead}>
                                        <span className={classes.mockHeadTitle}>Płótno · strona 1 z 2</span>
                                        <span className={classes.mockHeadMeta}>120%</span>
                                    </div>
                                    <div className={classes.canvasStage}>
                                        <div className={classes.canvasPage}>
                                            <div className={classes.cvHeading} />
                                            <div className={classes.cvSub} />
                                            <div className={classes.cvBar} style={{ width: "100%" }} />
                                            <div className={classes.cvBar} style={{ width: "94%", marginBottom: "18px" }} />
                                            <div className={classes.cvSelected}>
                                                <div className={classes.cvBar} style={{ width: "80%" }} />
                                                <div className={classes.cvBar} style={{ width: "66%", marginBottom: 0 }} />
                                            </div>
                                            <div className={classes.cvBar} style={{ width: "88%" }} />
                                            <div className={classes.cvBar} style={{ width: "72%", marginBottom: 0 }} />
                                            <div className={classes.cvGuide} />
                                            <div className={classes.cvGuideTag}>14 px</div>
                                            <div className={classes.cvEdge} />
                                        </div>
                                    </div>
                                </div>

                                <div className={classes.featureGrid}>
                                    <FeatureCard
                                        stripe="#6C9BE6" tint="rgba(108,155,230,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7BA6EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M9 4v16" /></svg>}
                                        title="Tekst i akapity"
                                        text="Jednoliniowe tytuły i wieloliniowe bloki — font, rozmiar, kolor, pogrubienie, kursywa, podkreślenie, wyrównanie, interlinia i odstępy liter."
                                    />
                                    <FeatureCard
                                        stripe="#E5A65C" tint="rgba(229,166,92,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E5A65C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>}
                                        title="Kształty, linie, łączniki"
                                        text="Prostokąty, koła, elipsy i linie — wypełnienie lub obrys, grubość i kolor krawędzi. Połącz elementy opcjonalnymi strzałkami."
                                    />
                                    <FeatureCard
                                        stripe="#E88A73" tint="rgba(232,138,115,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E88A73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
                                        title="Pracuj jak projektant"
                                        text="Zaznaczenie wielu elementów, prowadnice wyrównania i pomarańczowe markery z dokładnym odstępem w pikselach, blokada elementów, warstwy z-index."
                                    />
                                    <FeatureCard
                                        stripe="#6FBF8E" tint="rgba(111,191,142,.14)"
                                        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6FBF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                                        title="Zachowaj rytm pracy"
                                        text="Cofnij i ponów w ramach sesji, autozapis po chwili bez edycji, dodawanie i klonowanie stron, widok dwóch stron, powiadomienie gdy PDF jest gotowy."
                                    />
                                </div>
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
                                        text="Prześlij istniejące CV — Kompoza wyciąga imię, stanowisko, doświadczenie, wykształcenie i umiejętności, a potem wlewa je do dowolnego szablonu. Bez ponownego uploadu."
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
                                            <span className={classes.chatTitle}>Asystent Kompoza</span>
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
                                        <p className={classes.cardP}>Edytor, wybrane szablony i eksport PDF. AI Assistant — w planie Standard.</p>
                                        <Link to="/register" className={classes.priceCta}>
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

            {/* ---- Templates ---- */}
            <div id="szablony" className={classes.templatesSection}>
                <div className={classes.sectionHead}>
                    <span className={classes.eyebrow}>Szablony</span>
                    <h2 className={classes.sectionTitle}>Zacznij od gotowego, pięknego szablonu CV</h2>
                </div>
                <div className={classes.templatesGrid}>
                    {TEMPLATE_PREVIEWS.map((tpl) => (
                        <Link to="/register" className={classes.templateCard} key={tpl.id}>
                            <div className={classes.templateThumb}>
                                <img src={tpl.image} alt={tpl.name} />
                            </div>
                            <div className={classes.templateInfo}>
                                <div className={classes.templateName}>{tpl.name}</div>
                                <div className={classes.templateMeta}>{tpl.industry}</div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* ---- Testimonials ---- */}
            <div className={classes.testimonialsBand}>
                <div className={classes.testimonialsInner}>
                    <div className={classes.sectionHead}>
                        <span className={classes.eyebrow}>Opinie</span>
                        <h2 className={classes.sectionTitle}>Ludzie, którzy znaleźli pracę z Kompozą</h2>
                    </div>
                    <div className={classes.testimonialsGrid}>
                        <div className={classes.testimonialCard}>
                            <p className={classes.testimonialText}>„Zbudowałam CV w niecałe 20 minut i od razu widziałam, jak wygląda gotowy PDF. Dostałam odpowiedź z trzech firm w tym samym tygodniu.”</p>
                            <div className={classes.testimonialAuthor}>
                                <span className={classes.testimonialAvatar} style={{ background: "#6C9BE6" }} />
                                <div>
                                    <div className={classes.testimonialName}>Marta K.</div>
                                    <div className={classes.testimonialRole}>Specjalistka ds. marketingu</div>
                                </div>
                            </div>
                        </div>
                        <div className={classes.testimonialCard}>
                            <p className={classes.testimonialText}>„Analiza CV wychwyciła braki, których sam bym nie zauważył — brakujące słowa kluczowe, za długie akapity. Poprawiłem i poczułem różnicę.”</p>
                            <div className={classes.testimonialAuthor}>
                                <span className={classes.testimonialAvatar} style={{ background: "#E88A73" }} />
                                <div>
                                    <div className={classes.testimonialName}>Tomasz W.</div>
                                    <div className={classes.testimonialRole}>Inżynier oprogramowania</div>
                                </div>
                            </div>
                        </div>
                        <div className={classes.testimonialCard}>
                            <p className={classes.testimonialText}>„W końcu narzędzie, w którym CV wygląda równie dobrze na ekranie i po wydrukowaniu. Szablon Regent zrobił świetne wrażenie na rekrutacji.”</p>
                            <div className={classes.testimonialAuthor}>
                                <span className={classes.testimonialAvatar} style={{ background: "#6FBF8E" }} />
                                <div>
                                    <div className={classes.testimonialName}>Aleksandra P.</div>
                                    <div className={classes.testimonialRole}>Absolwentka prawa</div>
                                </div>
                            </div>
                        </div>
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
                        <Link to="/register" className={classes.planCtaSecondary}>Zacznij za darmo</Link>
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
                            <li>AI Assistant (40 akcji / mies.)</li>
                            <li>Wszystkie 24 szablony</li>
                            <li>Import z PDF i kreator bio</li>
                            <li>10 projektów · 30 eksportów / mies.</li>
                        </ul>
                        <Link to="/register" className={classes.planCtaPrimary}>Wybierz Standard</Link>
                    </div>

                    <div className={classes.planCard}>
                        <div className={classes.planName}>Pro</div>
                        <div className={classes.planPrice}>
                            <span className={classes.planAmount}>49</span>
                            <span className={classes.planCurrency}>zł</span>
                        </div>
                        <p className={classes.planPeriod}>miesięcznie · 469 zł / rok</p>
                        <ul className={classes.planFeatures}>
                            <li>AI bez limitu stresu (wysoki limit)</li>
                            <li>Wszystkie 24 szablony</li>
                            <li>Bez limitu projektów i eksportów</li>
                            <li>Wiele wersji CV pod oferty</li>
                        </ul>
                        <Link to="/register" className={classes.planCtaSecondary}>Wybierz Pro</Link>
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
                        <span className={classes.footerBrandName}>Kompoza</span>
                    </div>
                    <div className={classes.footerLinks}>
                        <a href="#funkcje" className={classes.footerLink}>Funkcje</a>
                        <a href="#cennik" className={classes.footerLink}>Cennik</a>
                        <a href="#szablony" className={classes.footerLink}>Szablony</a>
                        <Link to="/login" className={classes.footerLink}>Zaloguj się</Link>
                        <Link to="/register" className={classes.footerLinkAccent}>Zarejestruj się</Link>
                    </div>
                </div>
                <div className={classes.footerBottom}>© 2026 Kompoza. Wszystkie prawa zastrzeżone.</div>
            </footer>
        </div>
    );
}
