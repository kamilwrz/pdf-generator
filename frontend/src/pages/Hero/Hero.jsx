import { usePageTitle } from '../../i18n/usePageTitle.js';
import { templatePreviewPath } from '../../i18n/templatePreviews.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Conversion-focused marketing landing page for CV Studio.
 *
 * Page order: hero → interview → job tailoring → Studio tools + templates → privacy → pricing → FAQ → final CTA → footer.
 *
 * Creation starts the shared onboarding; template choice belongs there. Guests
 * can edit locally; saving and exporting require an account. Import enters the
 * account-scoped flow, while the demo opens sample content. Navigation to an
 * Assistant workflow or its credit explanation never starts paid AI. Gallery
 * plan labels describe registry access rather than the visitor's entitlement.
 * Anonymous CTA activity is not buffered or sent as analytics.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import HeroTemplateShowcase from "./HeroTemplateShowcase";
import InterviewDemo from "./InterviewDemo";
import { SiteHeader, SiteFooter, SkipToContent } from "../../components/common/SiteLayout/SiteLayout";
import { wakeBackend } from "../../services/api";
import { getAccessToken, getEditorPath } from "../../utils/authSession";
import { hasGuestDocument, loadGuestDocument } from "../../utils/guestDocument";
import {
    FREE_PLAN_HIGHLIGHTS,
    PRO_PLAN_HIGHLIGHTS,
} from "../../utils/planPresentation";

const TEMPLATE_PREVIEWS = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    tier: template.tier,
    get image() { return templatePreviewPath(template.id); },
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
 * Shared landing call-to-action with primary, secondary, and link variants.
 */
function CtaLink({ to, variant = "primary", children }) {
    const variantClass =
        variant === "secondary"
            ? classes.buttonSecondary
            : variant === "link"
            ? classes.textCta
            : classes.buttonPrimary;
    return (
        <Link to={to} className={variantClass}>
            {children}
            <ArrowIcon />
        </Link>
    );
}

/**
 * A manually browsed template rail. Native scrolling keeps touch and keyboard
 * navigation available; controls reflect the measured rail after every resize.
 * Failed previews retain their A4 space and usable destination link.
 */
function TemplateGallery() {
    const rail = useRef(null);
    const [edges, setEdges] = useState({ start: true, end: false });
    const [failedImages, setFailedImages] = useState({});

    useEffect(() => {
        const node = rail.current;
        const measure = () => setEdges({
            start: node.scrollLeft <= 1,
            end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
        });
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        node.addEventListener('scroll', measure, { passive: true });
        measure();
        return () => { observer.disconnect(); node.removeEventListener('scroll', measure); };
    }, []);

    const move = (direction) => {
        // CSS owns smooth scrolling so reduced-motion changes apply immediately.
        rail.current.scrollBy({ left: direction * rail.current.clientWidth * 0.8 });
    };

    return <>
        <div className={classes.templateGalleryHeader}>
            <p id="template-gallery-title" className={classes.templateGalleryLabel}>{uiText("public:hero.chooseYourCvSAppearance")}</p>
            <div className={classes.galleryControls}>
                <button type="button" aria-label={uiText('public:hero.previousTemplates')} aria-controls="landing-template-gallery" aria-disabled={edges.start} onClick={() => !edges.start && move(-1)}><ArrowIcon /></button>
                <button type="button" aria-label={uiText('public:hero.nextTemplates')} aria-controls="landing-template-gallery" aria-disabled={edges.end} onClick={() => !edges.end && move(1)}><ArrowIcon /></button>
            </div>
        </div>
        <div ref={rail} id="landing-template-gallery" className={classes.templateGallery} role="region" aria-labelledby="template-gallery-title" aria-description={uiText("public:hero.galleryOfCvTemplates", { value0: TEMPLATE_COUNT })}>
            {TEMPLATE_PREVIEWS.map((template) => <Link key={template.id} to={`/templates/${template.id}`} className={classes.templateCard}>
                <div className={classes.templatePreview}>
                    {failedImages[template.image]
                        ? <span>{uiText('public:publicPages.couldNotLoadThePreview')}</span>
                        : <img src={template.image} alt="" loading="lazy" onError={() => setFailedImages(current => ({ ...current, [template.image]: true }))} />}
                </div>
                <span><span className={classes.templateCaption}><b>{template.name}</b> <small>{template.tier === 'free' ? 'Free' : 'Pro'}</small></span><ArrowIcon /></span>
            </Link>)}
        </div>
    </>;
}

export default function Hero() {
  usePageTitle("common:homeTitle");
  useTranslation();
    useEffect(() => {
        // Warm the optional API while visitors read the landing page. Loading
        // the marketing content never depends on the backend being available.
        wakeBackend();
    }, []);

    // Free includes one successful monthly import; Pro removes that quota and
    // adds scale, every template, and AI workflows without changing PDF quality.
    const importUrl = buildStartUrl("import", "free");
    const newCvUrl = "/app/new";
    const demoUrl = getEditorPath({ start: "demo" });
    const canResumeGuestDraft = !getAccessToken() && hasGuestDocument() && !loadGuestDocument()?.isDemoContent;
    // Existing accounts manage their plan in the account workspace; this
    // destination does not grant Pro access or start a payment automatically.
    const proUrl = getAccessToken() ? "/app/account" : "/register?plan=pro";

    return (
        <div className={classes.page}>
            <SkipToContent />
            <SiteHeader showLanguageSelect />
            <main id="site-content" tabIndex={-1} className={classes.content}>
            <section id="top" className={classes.hero} tabIndex={-1}>
                <div className={classes.heroCopy}>
                    <p className={classes.kicker} data-section-index="01">{uiText('public:hero.kicker')}</p>
                    <div className={classes.heroHeading}>
                        <h1>{uiText("public:hero.yourCv")}<br /><span>{uiText("public:hero.readyToSend")}</span></h1>
                        <p className={classes.heroSubheading}>{uiText("public:hero.intro")}</p>
                    </div>
                    <div className={classes.heroActions}>
                        <CtaLink to={newCvUrl}>{uiText("public:hero.createACvForFree")}</CtaLink>
                        {canResumeGuestDraft && <CtaLink to={getEditorPath()} variant="link">{uiText("public:hero.returnToCvDraft")}</CtaLink>}
                    </div>
                    <p className={classes.accountNote}>{uiText("public:hero.accountNote")}</p>
                    <nav className={classes.heroTools} aria-label={uiText('public:hero.tools')}>
                        <Link className={classes.toolLink} to={demoUrl}>
                            <span><strong>{uiText('public:hero.editor')}</strong><span>{uiText('public:hero.editorHint')}</span></span><ArrowIcon />
                        </Link>
                        <Link className={classes.toolLink} to={importUrl}>
                            <span><strong>{uiText('public:hero.import')}</strong><span>{uiText('public:hero.importHint')}</span></span><ArrowIcon />
                        </Link>
                        <div className={classes.assistantTool}>
                            <p>{uiText('public:siteLayout.interview')} <small>Pro</small></p>
                            <div>
                                <a href="#wywiad">{uiText('public:hero.improveContent')}<ArrowIcon /></a>
                                <a href="#dopasowanie">{uiText('public:hero.tailorToJob')}<ArrowIcon /></a>
                            </div>
                        </div>
                    </nav>
                </div>
                <HeroTemplateShowcase templates={FREE_TEMPLATES} />
            </section>

            <section id="wywiad" className={classes.interviewSection} aria-labelledby="interview-title" tabIndex={-1}>
                <div>
                    <p className={classes.kicker} data-section-index="02">{uiText("public:hero.interviewLabel")}</p>
                    <h2 id="interview-title">{uiText("public:hero.interviewTitle")}</h2>
                    <p className={classes.interviewLead}>{uiText("public:hero.interviewBody")}</p>
                    <CtaLink to="/app/interview">{uiText("public:hero.openInterview")}</CtaLink>
                    <p className={classes.accountNote}>{uiText("public:hero.interviewAccess")}</p>
                    <CtaLink to="/help#kredyty-ai" variant="link">{uiText('public:hero.creditHelp')}</CtaLink>
                </div>
                <InterviewDemo />
            </section>

            <section id="dopasowanie" className={`${classes.interviewSection} ${classes.tailoringSection}`} aria-labelledby="tailoring-title" tabIndex={-1}>
                <div className={classes.tailoringCopy}>
                    <p className={classes.kicker} data-section-index="03">{uiText('public:hero.tailoringLabel')}</p>
                    <h2 id="tailoring-title">{uiText('public:hero.tailoringTitle')}</h2>
                    <p className={classes.interviewLead}>{uiText('public:hero.tailoringBody')}</p>
                    <CtaLink to="/app/tailor">{uiText('tailoring:title')}</CtaLink>
                    <p className={classes.accountNote}>{uiText('public:hero.tailoringAccess')}</p>
                    <CtaLink to="/help#kredyty-ai" variant="link">{uiText('public:hero.creditHelp')}</CtaLink>
                </div>
                <InterviewDemo tailoring />
            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.offerIntro}>
                    <div className={classes.offerStatement}>
                        <p className={classes.kicker} data-section-index="04">{uiText("public:hero.workYourWay")}</p>
                        <h2>
                            <span>{uiText("public:hero.enterYourContentOnce")}</span>
                            <span>{uiText("public:hero.changeTheLayoutLater")}</span>
                        </h2>
                        <p className={classes.offerLead}>{uiText("public:hero.switchTemplatesAndRefineDescriptionsForDifferent")}</p>
                    </div>
                    {/*
                      The ruled feature list replaces generic cards without pretending
                      the product has one mandatory workflow. Its source order remains
                      the reading order on compact and zoomed layouts.
                    */}
                    <ul className={classes.offerSteps} aria-label={uiText("public:hero.keyCvStudioFeatures")}>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">01</span>
                            <div>
                                <h3>{uiText("public:hero.alreadyHaveACvImportYourPdf")}</h3>
                                <p>{uiText("public:hero.cvStudioReadsYourDocumentAndLays")}</p>
                                <CtaLink to={importUrl} variant="link">{uiText("public:hero.importCvFromPdf")}</CtaLink>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">02</span>
                            <div>
                                <h3>{uiText("public:hero.editDirectlyOnA")}</h3>
                                <p>{uiText("public:hero.clickAnyDescriptionAndStartTypingFont")}</p>
                            </div>
                        </li>
                        <li>
                            <span className={classes.offerStepIndex} aria-hidden="true">03</span>
                            <div>
                                <h3>{uiText("public:hero.fitTitle")}</h3>
                                <p>{uiText("public:hero.fitBody")}</p>
                                <CtaLink to="/help#jedna-strona" variant="link">{uiText("public:hero.fitLink")}</CtaLink>
                            </div>
                        </li>
                    </ul>
                </div>

                <TemplateGallery />
                <CtaLink to="/templates" variant="link">{uiText("public:hero.chooseATemplateAndCreateACv")}</CtaLink>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker} data-section-index="05">{uiText("public:siteLayout.privacy")}</p>
                    <h2>{uiText("public:hero.yourCvIsNotPublic")}</h2>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />{uiText("public:hero.signInToReturnToYourSaved")}</li>
                    <li><CheckIcon />{uiText("public:hero.theOriginalPdfIsNotStoredIn")}</li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker} data-section-index="06">{uiText("public:siteLayout.pricing")}</p>
                    <h2>
                        <span>{uiText("public:hero.startForFree")}</span>
                        <em>{uiText("public:hero.chooseProWhenAiWouldHelp")}</em>
                    </h2>
                    <p>{uiText("public:hero.everyPlanIncludesPdfDownloadsWithoutWatermarks")}</p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <div className={classes.planHeader}><h3 className={classes.planName}>{uiText("public:hero.free")}</h3></div>
                        <div className={classes.planIntro}>
                            <p className={classes.planPrice}>0 <small>{uiText("account:planSelectModal.pln")}</small></p>
                            <p className={classes.planSummary}>{uiText("public:hero.oneSavedCvFullManualEditingAnd")}</p>
                        </div>
                        <ul>
                            {FREE_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <CtaLink to={newCvUrl} variant="secondary">{uiText("public:hero.createACvForFree")}</CtaLink>
                        <p className={classes.planFootnote}>{uiText("public:hero.noCardRequiredThePlanHasNo")}</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <div className={classes.planHeader}>
                            <h3 className={classes.planName}>Pro</h3>
                            <span className={classes.popularTag}>{uiText("public:hero.withAiAssistance")}</span>
                        </div>
                        <div className={classes.planIntro}>
                            <p className={classes.planPrice}>59 <small>{uiText("account:planSelectModal.pln")}</small></p>
                            <p className={classes.planSummary}>{uiText("public:hero.workOnYourWritingWithAiAnd")}</p>
                            <p className={classes.planPeriod}>{uiText("public:hero.daysOfFullAccess")}</p>
                            <p className={classes.creditNote}>{uiText('public:hero.creditExplanation')}</p>
                            <CtaLink to="/help#kredyty-ai" variant="link">{uiText('public:hero.creditHelp')}</CtaLink>
                        </div>
                        <ul>
                            {PRO_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <Link
                            className={classes.buttonPrimary}
                            to={proUrl}
                        >{uiText("public:hero.chooseProForDays")} <ArrowIcon />
                        </Link>
                        <p className={classes.planFootnote}>{uiText("public:hero.oneOffPaymentNoAutomaticRenewal")}</p>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker} data-section-index="07">{uiText("public:hero.beforeYouStart")}</p>
                    <h2>{uiText("public:hero.whatShouldYouKnow")}</h2>
                    <KnowledgeIcon />
                </div>
                <div className={classes.faqList}>
                    <details>
                        <summary>{uiText("public:hero.startQuestion")}</summary>
                        <p><a href="#top">{uiText("public:hero.createACvForFree")}</a></p>
                        <p><Link to={importUrl}>{uiText("public:hero.alreadyHaveACvImportYourPdf")}</Link></p>
                        <p><a href="#wywiad">{uiText("public:hero.interviewJump")}</a></p>
                        <p><a href="#dopasowanie">{uiText("public:hero.tailoringJump")}</a></p>
                    </details>
                    <details open>
                        <summary>{uiText("public:hero.canIDownloadMyCvForFree")}</summary>
                        <p>{uiText("public:hero.yesAFreeAccountIncludesPdfDownloads")} {FREE_TEMPLATES.length} {uiText("public:hero.freeTemplatesOtherAllowancesAreListedIn")} <Link to="/pricing">{uiText("public:hero.pricing")}</Link>{uiText("public:hero.aiAssistanceIsAvailableWithPro")}</p>
                    </details>
                    <details>
                        <summary>{uiText("public:hero.doINeedAnAccountToStart")}</summary>
                        <p>{uiText("public:hero.noChooseATemplateAndStartEditing")}</p>
                    </details>
                    <details>
                        <summary>{uiText("public:hero.whatHappensToMyCvAfterImporting")}</summary>
                        <p>{uiText("public:hero.weExtractTheContentAndLayIt")}</p>
                    </details>
                    <details>
                        <summary>{uiText("public:hero.aiToolsQuestion")}</summary>
                        <p>{uiText("public:hero.aiToolsAnswer")}</p>
                    </details>
                    <details><summary>{uiText("public:hero.fitQuestion")}</summary><p>{uiText("public:hero.fitAnswer")}</p></details>
                    <details>
                        <summary>{uiText("public:hero.doesProRenewAutomatically")}</summary>
                        <p>{uiText("public:hero.noYouPayPlnOnceForDays")}</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta} aria-labelledby="final-cta-title">
                <p className={classes.kicker} data-section-index="08">{uiText("public:hero.startWithATemplate")}</p>
                <h2 id="final-cta-title">{uiText("public:hero.prepareYourCvForYourNextApplication")}</h2>
                <CtaLink to={newCvUrl} event="final_wizard">{uiText("public:hero.createACvForFree")}</CtaLink>
            </section>

            </main>
            <SiteFooter />
        </div>
    );
}

/** Decorative knowledge motif; the FAQ heading carries its accessible meaning. */
function KnowledgeIcon() {
    return (
        <svg className={classes.knowledgeIcon} viewBox="0 0 240 200" fill="none" aria-hidden="true" focusable="false">
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M24 108c34-6 66 0 96 18 30-18 62-24 96-18v72c-34-6-66 0-96 12-30-12-62-18-96-12Z" fill="var(--color-surface)" />
                <path d="M32 96c32-4 60 4 88 22 28-18 56-26 88-22v72c-32-4-60 4-88 20-28-16-56-24-88-20Z" fill="var(--color-paper)" />
                <path d="M120 118v70M48 116c18 0 36 5 54 14m-54 2c18 0 36 5 54 14m-54 2c12 0 24 2 36 7m108-39c-18 0-36 5-54 14m54 2c-18 0-36 5-54 14m54 2c-12 0-24 2-36 7" />
                <path d="M108 80c0-10-14-14-14-30a26 26 0 0 1 52 0c0 16-14 20-14 30Z" fill="var(--color-accent-soft)" />
                <path d="M108 87h24m-20 7h16m-14-14V64l-6-6m18 22V64l6-6m-18 6h12M120 8v6m-34 5 5 6m63-6-5 6M76 49h-8m104 0h-8M83 75l-6 5m80-5 6 5" />
            </g>
        </svg>
    );
}
