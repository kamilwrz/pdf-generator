import { usePageTitle } from '../../i18n/usePageTitle.js';
import { templatePreviewPath } from '../../i18n/templatePreviews.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
 * calls the account-scoped `POST /ai/extract_cv` endpoint. Template-specific
 * setup and demo links go straight to the editor; generic creation links use
 * `/app/new` so signed-in users can choose any creation method while guests
 * retain direct A4 setup. Anonymous CTA activity is not buffered or sent as
 * analytics.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import classes from "./Hero.module.css";
import { TEMPLATES } from "../../templates";
import HeroTemplateShowcase from "./HeroTemplateShowcase";
import { SiteHeader, SiteFooter } from "../../components/common/SiteLayout/SiteLayout";
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
    get image() { return templatePreviewPath(template.id); },
}));

// Dynamic template count keeps the full template gallery and its accessible
// name aligned with the actual registry.
const TEMPLATE_COUNT = TEMPLATES.length;
const FREE_TEMPLATES = TEMPLATES.filter((template) => template.tier === "free");

function ArrowIcon() {
  useTranslation();
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CheckIcon() {
  useTranslation();
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
  useTranslation();
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

export default function Hero() {
  usePageTitle("common:homeTitle");
  useTranslation();
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
    const newCvUrl = "/app/new";
    const selectedTemplateUrl = getEditorPath({ start: "new", template: selectedTemplateId });
    const demoUrl = getEditorPath({ start: "demo" });
    const canResumeGuestDraft = !getAccessToken() && hasGuestDocument() && !loadGuestDocument()?.isDemoContent;
    const proRegisterUrl = "/register?plan=pro";

    return (
        <main className={classes.page}>
            <SiteHeader showLanguageSelect />

            <section id="top" className={classes.hero}>
                <div className={classes.heroCopy}>
                    <p className={classes.kicker} data-section-index="01">CV Studio online</p>
                    <div className={classes.heroHeading}>
                        <h1>{uiText("public:hero.yourCv")}<br /><span>{uiText("public:hero.readyToSend")}</span></h1>
                        <p className={classes.heroSubheading}>{uiText("public:hero.chooseATemplateAndEnterContentDirectly")}</p>
                    </div>
                    <div className={classes.heroActions}>
                        <CtaLink to={selectedTemplateUrl} event="hero_new_cv">{uiText("public:hero.createACvWithThisTemplate")}</CtaLink>
                        {canResumeGuestDraft ? <Link to={getEditorPath()} className={classes.buttonSecondary}>{uiText("public:hero.returnToCvDraft")} <ArrowIcon /></Link> : <CtaLink to={demoUrl} event="hero_demo" variant="secondary">{uiText("public:hero.exploreTheEditor")}</CtaLink>}
                    </div>
                    <p className={classes.accountNote}>{uiText("public:hero.startWithoutAnAccountFreeRegistrationIs")}</p>
                    <ul className={classes.heroTrust} aria-label={uiText("public:hero.startWith")}>
                        <li>{uiText("public:hero.freeEditor")}</li>
                        <li>{uiText("public:hero.pdfWithoutAWatermark")}</li>
                        <li>{FREE_TEMPLATES.length} {uiText("public:hero.freeTemplates")}</li>
                    </ul>
                </div>
                <HeroTemplateShowcase
                    templates={FREE_TEMPLATES}
                    selectedId={selectedTemplateId}
                    onSelect={setSelectedTemplateId}
                    mobileAction={<CtaLink to={selectedTemplateUrl} event="hero_new_cv">{uiText("public:hero.createACvWithTheSelectedTemplate")}</CtaLink>}
                />
            </section>

            <section id="szablony" className={classes.templatesSection}>
                <div className={classes.offerIntro}>
                    <div className={classes.offerStatement}>
                        <p className={classes.kicker} data-section-index="02">{uiText("public:hero.workYourWay")}</p>
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
                                <CtaLink to={importUrl} event="hero_import" variant="link">{uiText("public:hero.importCvFromPdf")}</CtaLink>
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
                                <h3>{uiText("public:hero.proCanAskAboutYourExperience")}</h3>
                                <p>{uiText("public:hero.describeYourWorkProjectsAndResultsAn")}</p><CtaLink to="/help#wywiad" variant="link">{uiText("public:hero.seeHowInterviewsWork")}</CtaLink><p>{uiText("public:hero.aiInProCanAlsoShortenDescriptions")}</p>
                                {/* Static sample explains the paid feature without running AI or promising a live result. */}
                                <dl className={classes.copyExample} aria-label={uiText("public:hero.exampleOfAiStyleEditingInPro")}>
                                    <div><dt>{uiText("ai:aiAssistant.before")}</dt><dd>{uiText("public:hero.iWasResponsibleForPreparingSalesReports")}</dd></div>
                                    <div><dt>Po</dt><dd>{uiText("public:hero.iPreparedSalesReports")}</dd></div>
                                </dl>
                            </div>
                        </li>
                    </ul>
                </div>

                <div className={classes.templateGalleryHeader}>
                    <p id="template-gallery-title" className={classes.templateGalleryLabel}>{uiText("public:hero.chooseYourCvSAppearance")}</p>
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
                    aria-description={uiText("public:hero.galleryOfCvTemplates", { value0: (TEMPLATE_COUNT) })}
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
                                    >
                                        <img
                                            src={template.image}
                                            alt={copy === 0 ? uiText("public:hero.cvTemplate", { value0: (template.name) }) : ""}
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
                <CtaLink to="/templates" event="templates_new_cv" variant="link">{uiText("public:hero.chooseATemplateAndCreateACv")}</CtaLink>
            </section>

            <section id="privacy" className={classes.trustStrip}>
                <div className={classes.trustHeading}>
                    <p className={classes.kicker} data-section-index="03">{uiText("public:siteLayout.privacy")}</p>
                    <h2>{uiText("public:hero.yourCvIsNotPublic")}</h2>
                </div>
                <ul className={classes.trustPoints}>
                    <li><CheckIcon />{uiText("public:hero.signInToReturnToYourSaved")}</li>
                    <li><CheckIcon />{uiText("public:hero.theOriginalPdfIsNotStoredIn")}</li>
                </ul>
            </section>

            <section id="cennik" className={classes.pricingSection}>
                <div className={classes.pricingHeading}>
                    <p className={classes.kicker} data-section-index="04">{uiText("public:siteLayout.pricing")}</p>
                    <h2>
                        <span>{uiText("public:hero.startForFree")}</span>
                        <em>{uiText("public:hero.chooseProWhenAiWouldHelp")}</em>
                    </h2>
                    <p>{uiText("public:hero.everyPlanIncludesPdfDownloadsWithoutWatermarks")}</p>
                </div>
                <div className={classes.pricingGrid}>
                    <article className={classes.priceCard}>
                        <p className={classes.planName}>{uiText("public:hero.free")}</p>
                        <p className={classes.planPrice}>0 <small>{uiText("account:planSelectModal.pln")}</small></p>
                        <p className={classes.planSummary}>{uiText("public:hero.oneSavedCvFullManualEditingAnd")}</p>
                        <ul>
                            {FREE_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <CtaLink to={newCvUrl} event="pricing_free" variant="secondary">{uiText("public:hero.createACvForFree")}</CtaLink>
                        <p className={classes.planFootnote}>{uiText("public:hero.noCardRequiredThePlanHasNo")}</p>
                    </article>
                    <article className={`${classes.priceCard} ${classes.priceFeatured}`}>
                        <span className={classes.popularTag}>{uiText("public:hero.withAiAssistance")}</span>
                        <p className={classes.planName}>Pro</p>
                        <p className={classes.planPrice}>59 <small>{uiText("account:planSelectModal.pln")}</small></p>
                        <p className={classes.planSummary}>{uiText("public:hero.workOnYourWritingWithAiAnd")}</p>
                        <p className={classes.planPeriod}>{uiText("public:hero.daysOfFullAccess")}</p>
                        <ul>
                            {PRO_PLAN_HIGHLIGHTS.map((feature) => (
                                <li key={feature}><CheckIcon />{feature}</li>
                            ))}
                        </ul>
                        <Link
                            className={classes.buttonPrimary}
                            to={proRegisterUrl}
                        >{uiText("public:hero.chooseProForDays")} <ArrowIcon />
                        </Link>
                        <p className={classes.planFootnote}>{uiText("public:hero.oneOffPaymentNoAutomaticRenewal")}</p>
                    </article>
                </div>
            </section>

            <section className={classes.faqSection}>
                <div>
                    <p className={classes.kicker} data-section-index="05">{uiText("public:hero.beforeYouStart")}</p>
                    <h2>{uiText("public:hero.whatShouldYouKnow")}</h2>
                </div>
                <div className={classes.faqList}>
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
                        <summary>{uiText("public:hero.doesProRenewAutomatically")}</summary>
                        <p>{uiText("public:hero.noYouPayPlnOnceForDays")}</p>
                    </details>
                </div>
            </section>

            <section className={classes.finalCta} aria-labelledby="final-cta-title">
                <p className={classes.kicker} data-section-index="06">{uiText("public:hero.startWithATemplate")}</p>
                <h2 id="final-cta-title">{uiText("public:hero.prepareYourCvForYourNextApplication")}</h2>
                <CtaLink to={newCvUrl} event="final_wizard">{uiText("public:hero.createACvForFree")}</CtaLink>
            </section>

            <SiteFooter />
        </main>
    );
}
