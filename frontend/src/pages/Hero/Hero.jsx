import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import API_BASE_URL from "../../services/api";

const TEMPLATE_PREVIEWS = [
    { id: "ledger", name: "Ledger", industry: "Finanse · Instytucjonalny", image: `${API_BASE_URL}/template-assets/ledger-finance-accent.png` },
    { id: "vector", name: "Vector", industry: "IT · Sieci i platformy", image: `${API_BASE_URL}/template-assets/vector-it-network.png` },
    { id: "quarry", name: "Quarry", industry: "Sidebar · Nocny system", image: `${API_BASE_URL}/template-assets/quarry-sidebar.png` },
    { id: "garnet", name: "Garnet", industry: "Sidebar · Art déco executive", image: `${API_BASE_URL}/template-assets/garnet-sidebar.png` },
];

export default function Hero() {
    return (
        <div className={classes.page}>
            <div className={classes.blob} aria-hidden="true" />

            {/* ---- Nav ---- */}
            <nav className={classes.nav}>
                <div className={classes.brand}>
                    <span className={classes.brandMark}><img src="/kompoza-logo.png" alt="" /></span>
                    <span className={classes.brandName}>Kompoza</span>
                </div>
                <div className={classes.navLinks}>
                    <a href="#funkcje" className={classes.navLink}>Funkcje</a>
                    <a className={classes.navLink}>Cennik</a>
                    <a href="#szablony" className={classes.navLink}>Szablony</a>
                    <Link to="/login" className={classes.navLink}>Zaloguj się</Link>
                    <Link to="/register" className={classes.navCta}>Rozpocznij za darmo</Link>
                </div>
            </nav>

            {/* ---- Hero body ---- */}
            <div className={classes.hero}>
                <div className={classes.heroCopy}>
                    <div className={classes.badge}>
                        <span className={classes.badgeDot}><span /></span>
                        <span>Bez umiejętności projektowania</span>
                    </div>
                    <h1 className={classes.heading}>
                        Twórz <span className={classes.accentWord}>piękne</span> CV w kilka minut.
                    </h1>
                    <p className={classes.subheading}>
                        Przeciągaj, upuszczaj i projektuj. Wybierz szablon, uzupełnij swoje doświadczenie,
                        a Kompoza od razu wyeksportuje dopracowane CV w PDF, gotowe do wysłania.
                    </p>
                    <div className={classes.ctaRow}>
                        <Link to="/register" className={classes.primaryCta}>
                            Zacznij projektować
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                        </Link>
                        <a href="#jak-to-dziala" className={classes.secondaryCta}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                            Zobacz, jak działa
                        </a>
                    </div>
                    <div className={classes.social}>
                        <div className={classes.avatars}>
                            <span style={{ background: "#8FB0DB" }} />
                            <span style={{ background: "#E8A6A0" }} />
                            <span style={{ background: "#A9C5B0" }} />
                        </div>
                        <span className={classes.socialText}>Ponad 12 000 twórców nas poleca</span>
                    </div>
                </div>

                {/* ---- Product preview ---- */}
                <div className={classes.preview}>
                    <div className={classes.window}>
                        <div className={classes.windowBar}>
                            <span className={classes.dot} style={{ background: "#E8A6A0" }} />
                            <span className={classes.dot} style={{ background: "#9DB6D8" }} />
                            <span className={classes.dot} style={{ background: "#A9C5B0" }} />
                            <span className={classes.windowFile}>cv-anna-kowalska.pdf</span>
                        </div>
                        <div className={classes.windowBody}>
                            <div className={classes.windowRail}>
                                <span className={classes.railActive} />
                                <span className={classes.railItem} />
                                <span className={classes.railItem} />
                                <span className={classes.railItem} />
                            </div>
                            <div className={classes.windowCanvas}>
                                <div className={classes.miniPage}>
                                    <div className={classes.miniBanner} />
                                    <div className={classes.miniLine} style={{ width: "70%" }} />
                                    <div className={classes.miniLineSm} style={{ width: "50%" }} />
                                    <div className={classes.miniBar} style={{ width: "100%" }} />
                                    <div className={classes.miniBar} style={{ width: "92%" }} />
                                    <div className={classes.miniBar} style={{ width: "96%" }} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={classes.floatCard}>
                        <span className={classes.floatIcon}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FA777" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                        <div>
                            <div className={classes.floatTitle}>PDF wyeksportowany</div>
                            <div className={classes.floatSub}>w 1,4 sekundy</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ---- How it works ---- */}
            <div id="jak-to-dziala" className={classes.steps}>
                <div className={classes.sectionHead}>
                    <span className={classes.eyebrow}>Jak to działa</span>
                    <h2 className={classes.sectionTitle}>Od pustej strony do PDF-a w trzech krokach</h2>
                </div>
                <div className={classes.stepsGrid}>
                    <div className={classes.stepCard}>
                        <div className={classes.stepNumber}>1</div>
                        <h3 className={classes.stepTitle}>Wybierz szablon CV</h3>
                        <p className={classes.stepText}>Zacznij od jednego z gotowych układów CV, dopasowanego do Twojej branży — od finansów po IT.</p>
                    </div>
                    <div className={classes.stepCard}>
                        <div className={classes.stepNumber}>2</div>
                        <h3 className={classes.stepTitle}>Edytuj w kreatorze</h3>
                        <p className={classes.stepText}>Przeciągaj tekst, obrazy i kształty na wizualnym płótnie A4 — bez kodu i bez programów graficznych.</p>
                    </div>
                    <div className={classes.stepCard}>
                        <div className={classes.stepNumber}>3</div>
                        <h3 className={classes.stepTitle}>Eksportuj PDF</h3>
                        <p className={classes.stepText}>Pobierz gotowy plik w tej samej jakości, jaką widziałeś na ekranie — czcionka co do piksela.</p>
                    </div>
                </div>
            </div>

            {/* ---- Features ---- */}
            <div id="funkcje" className={classes.featuresBand}>
                <div className={classes.featuresInner}>
                    <div className={classes.sectionHead}>
                        <span className={classes.eyebrow}>Funkcje</span>
                        <h2 className={classes.sectionTitle}>Wszystko, czego potrzebujesz do idealnego CV</h2>
                    </div>
                    <div className={classes.featuresGrid}>
                        <div className={classes.featureItem}>
                            <div className={classes.featureIcon}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M9 4v16" /></svg>
                            </div>
                            <h4 className={classes.featureTitle}>Wizualny edytor</h4>
                            <p className={classes.featureText}>Przeciągnij i upuść tekst, obrazy oraz kształty na płótnie A4.</p>
                        </div>
                        <div className={classes.featureItem}>
                            <div className={classes.featureIcon}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                            </div>
                            <h4 className={classes.featureTitle}>Wierny eksport PDF</h4>
                            <p className={classes.featureText}>Te same czcionki w edytorze i w pliku — bez niespodzianek po eksporcie.</p>
                        </div>
                        <div className={classes.featureItem}>
                            <div className={classes.featureIcon}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                            </div>
                            <h4 className={classes.featureTitle}>Biblioteka szablonów</h4>
                            <p className={classes.featureText}>Ponad 20 gotowych układów CV, dopasowanych do różnych branż i stanowisk.</p>
                        </div>
                        <div className={classes.featureItem}>
                            <div className={classes.featureIcon}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                            </div>
                            <h4 className={classes.featureTitle}>Analiza CV</h4>
                            <p className={classes.featureText}>Wskazówki dotyczące treści, długości i słów kluczowych, zanim wyślesz CV dalej.</p>
                        </div>
                    </div>
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
                                <span className={classes.testimonialAvatar} style={{ background: "#8FB0DB" }} />
                                <div>
                                    <div className={classes.testimonialName}>Marta K.</div>
                                    <div className={classes.testimonialRole}>Specjalistka ds. marketingu</div>
                                </div>
                            </div>
                        </div>
                        <div className={classes.testimonialCard}>
                            <p className={classes.testimonialText}>„Analiza CV wychwyciła braki, których sam bym nie zauważył — brakujące słowa kluczowe, za długie akapity. Poprawiłem i poczułem różnicę.”</p>
                            <div className={classes.testimonialAuthor}>
                                <span className={classes.testimonialAvatar} style={{ background: "#E8A6A0" }} />
                                <div>
                                    <div className={classes.testimonialName}>Tomasz W.</div>
                                    <div className={classes.testimonialRole}>Inżynier oprogramowania</div>
                                </div>
                            </div>
                        </div>
                        <div className={classes.testimonialCard}>
                            <p className={classes.testimonialText}>„W końcu narzędzie, w którym CV wygląda równie dobrze na ekranie i po wydrukowaniu. Szablon Regent zrobił świetne wrażenie na rekrutacji.”</p>
                            <div className={classes.testimonialAuthor}>
                                <span className={classes.testimonialAvatar} style={{ background: "#A9C5B0" }} />
                                <div>
                                    <div className={classes.testimonialName}>Aleksandra P.</div>
                                    <div className={classes.testimonialRole}>Absolwentka prawa</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ---- Final CTA ---- */}
            <div className={classes.finalCta}>
                <h2 className={classes.finalCtaTitle}>Gotowy na CV, które otwiera drzwi?</h2>
                <p className={classes.finalCtaText}>Załóż darmowe konto i wypróbuj pierwszy szablon już dziś.</p>
                <Link to="/register" className={classes.finalCtaBtn}>
                    Rozpocznij za darmo
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                </Link>
            </div>

            {/* ---- Footer ---- */}
            <footer className={classes.footer}>
                <div className={classes.footerTop}>
                    <div className={classes.footerBrand}>
                        <span className={classes.footerBrandMark}><img src="/kompoza-logo.png" alt="" /></span>
                        <span className={classes.footerBrandName}>Kompoza</span>
                    </div>
                    <div className={classes.footerLinks}>
                        <a href="#funkcje" className={classes.footerLink}>Funkcje</a>
                        <a className={classes.footerLink}>Cennik</a>
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
