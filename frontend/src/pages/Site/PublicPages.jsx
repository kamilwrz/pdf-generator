import { templatePreviewPath } from '../../i18n/templatePreviews.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Public information pages reuse the template registry and canonical plan copy. */
import { useState } from 'react';
import { FiCheck, FiFileText, FiUpload, FiDownload, FiFolder, FiArrowRight, FiMessageSquare } from 'react-icons/fi';
import { HeroNote, SiteMarker } from '../../components/common/SiteLayout/SitePrimitives';
import { Link, useParams } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import { TEMPLATES } from '../../templates';
import { PLAN_PRESENTATION } from '../../utils/planPresentation';
import { getAccessToken, getEditorPath } from '../../utils/authSession';
import { NotFoundPage } from '../../components/common/ErrorBoundary/ErrorBoundary';

/** Keep the document footprint and navigation available when a preview fails. */
export function TemplatePreview({ template }) {
  useTranslation();
  const [failed, setFailed] = useState(false);
  return <div className={classes.preview}>{failed ? <span>{uiText("public:publicPages.couldNotLoadThePreview")}</span> : <img src={templatePreviewPath(template.id)} alt={uiText("public:publicPages.sampleCv", { value0: (template.name) })} loading="lazy" onError={() => setFailed(true)} />}</div>;
}

export function TemplatesPage() {
  useTranslation();
  const [tier, setTier] = useState('all');
  const templates = TEMPLATES.filter((template) => tier === 'all' || template.tier === tier);
  return <SiteLayout title={uiText("public:publicPages.findALayoutForYourCv")} intro={uiText("public:publicPages.seeHowEachTemplateOrganisesContentIf")}>
    <div className={classes.toolbar}><div className={classes.field}><label htmlFor="template-tier">{uiText("public:publicPages.showTemplates")}</label><select id="template-tier" value={tier} onChange={(event) => setTier(event.target.value)}><option value="all">{uiText("public:publicPages.all")}</option><option value="free">{uiText("public:publicPages.free")}</option><option value="paid">{uiText("public:publicPages.withPro")}</option></select></div><Link to="/pricing">{uiText("auth:register.comparePlans")}</Link></div>
    <p role="status">{uiText("public:publicPages.showing")} {templates.length} {templates.length === 1 ? 'szablon' : templates.length < 5 ? 'szablony' : uiText("public:publicPages.templates")}.</p>
    <div className={classes.grid}>{templates.map((template) => <Link className={classes.template} key={template.id} to={`/templates/${template.id}`}><TemplatePreview template={template} /><h2>{template.name}</h2><p><span className={classes.badge}>{template.tier === 'free' ? uiText("public:hero.free") : 'Pro'}</span> · {template.layouts.includes('sidebar') ? uiText("editor:newCvSetupModal.twoColumns") : uiText("editor:newCvSetupModal.oneColumn")}</p><p>{template.description}</p></Link>)}</div>
  </SiteLayout>;
}

export function TemplatePage() {
  useTranslation();
  const { slug } = useParams();
  const template = TEMPLATES.find((item) => item.id === slug);
  if (!template) return <NotFoundPage />;
  return <SiteLayout title={template.name} eyebrow={uiText("public:publicPages.cvTemplate")} intro={template.description} breadcrumbs={[{ label: uiText("public:siteLayout.templates"), to: '/templates' }, { label: template.name }]}>
    <div className={classes.split}><div className={classes.detailPreview}><TemplatePreview key={template.id} template={template} /></div><section className={classes.section}>
      <h2>{template.details.heading}</h2>
      <p>{template.details.body}</p>
      <h3>{uiText("public:publicPages.howDoesThisLayoutOrganiseContent")}</h3>
      <ul>{template.details.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
      <p>{template.tier === 'free' ? uiText("public:publicPages.thisTemplateIsAvailableOnFreeStart") : uiText("public:publicPages.thisTemplateIsAvailableWithProYou")}</p>
      <div className={classes.actions}><Link className={classes.primary} to={getEditorPath({ start: 'new', template: template.id })}>{uiText("editor:templatesModal.useTemplate")} {template.name}</Link><Link className={classes.secondary} to="/pricing">{uiText("auth:register.comparePlans")}</Link></div>
      <p><Link to="/help#tworzenie">{uiText("public:publicPages.seeHowToStart")}</Link></p>
      <Link to="/templates">{uiText("public:publicPages.seeAllTemplates")}</Link>
    </section></div>
  </SiteLayout>;
}

/** Compares canonical plan copy; emphasis does not alter billing or access checks. */
export function PricingPage() {
  useTranslation();
  return <SiteLayout title={uiText("public:publicPages.chooseYourPlan")} eyebrow="CENNIK" intro={uiText("public:publicPages.freeIsEnoughToPrepareACv")}
    heroAside={<HeroNote icon={<FiFileText />} label={uiText("public:publicPages.inEveryPlan")} title={uiText("public:publicPages.pdfWithoutAWatermark")}><p>{uiText("public:publicPages.chooseAPlanBasedOnHowMany")}</p></HeroNote>}>
    <div className={classes.planGrid}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={`${classes.plan} ${plan.slug === 'pro' ? classes.planFeatured : ''}`}>
      <div className={classes.planLabel}><span>{plan.name}</span><span>{plan.slug === 'free' ? uiText("public:publicPages.toStart") : uiText("public:publicPages.forWorkingWithAi")}</span></div>
      <h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p>
      <ul className={classes.checklist}>{plan.highlights.map((item) => <li key={item}><FiCheck aria-hidden="true" /><span>{item}</span></li>)}</ul>
      <div className={classes.planBottom}><p>{plan.period_note}</p><Link className={plan.slug === 'pro' ? classes.secondary : classes.primary} to={plan.slug === 'free' ? '/app/new' : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}<FiArrowRight aria-hidden="true" /></Link></div>
    </section>)}</div>
    <section id="wywiad" tabIndex={-1} className={classes.supportPanel}><SiteMarker><FiMessageSquare /></SiteMarker><div><p className={classes.eyebrow}>{uiText("public:publicPages.interviewWithPro")}</p><h2>{uiText("public:publicPages.describeYourWorkAndAiWillHelp")}</h2><p>{uiText("public:publicPages.interviewsAskAboutActivitiesToolsAndResults")}</p><p>{uiText("public:publicPages.interviewsUseTheSharedPoolOfCredits")}</p><Link to="/help#wywiad">{uiText("public:publicPages.howInterviewsAndCreditsWork")} <FiArrowRight aria-hidden="true" /></Link></div></section>
    <section className={classes.supportPanel}><SiteMarker><FiFolder /></SiteMarker><div><h2>{uiText("public:publicPages.whatHappensWhenIUseMyAllowance")}</h2><p>{uiText("public:publicPages.yourNextSaveImportDownloadOrAi")}</p><Link to="/app/account">{uiText("public:publicPages.checkPlanAndUsage")}</Link></div></section>
  </SiteLayout>;
}

/** Native anchors keep help topics bookmarkable and keyboard reachable without tab state. */
export function HelpPage() {
  useTranslation();
  return <SiteLayout title={uiText("public:publicPages.helpCreatingYourCv")} eyebrow="INSTRUKCJE" intro={uiText("public:publicPages.chooseATopicToGoStraightTo")}
    heroAside={<HeroNote icon={<FiFileText />} label={uiText("public:publicPages.yourFirstCvInStudio")} title={uiText("public:publicPages.startWithATemplate")}><p>{uiText("public:publicPages.enterContentDirectlyOnAAndChange")}</p><Link className={classes.secondary} to="/templates">{uiText("public:publicPages.viewTemplates")}<FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <div className={classes.guideLayout}>
    <nav className={classes.guideNav} aria-label={uiText("public:publicPages.helpTopics")}><p className={classes.eyebrow}>{uiText("public:publicPages.onThisPage")}</p>{[['tworzenie', uiText("editor:topbar.creatingCv")], ['wywiad', uiText("public:publicPages.aiInterviewPro")], ['dopasowanie', uiText("public:publicPages.jobSpecificCvPro")], ['profil', uiText("account:accountPage.profileAndSavedInterviews")], ['import', 'Import PDF'], ['pobieranie', uiText("public:publicPages.savingAndDownloading")], ['powrot', uiText("public:publicPages.returnToADocument")]].map(([id, label], index) => <a key={id} href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{label}<FiArrowRight aria-hidden="true" /></a>)}</nav>
    <div className={classes.guideContent}>
    <section id="tworzenie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topic")}</span></div><h2>{uiText("editor:newCvSetupModal.createANewCv")}</h2><ol><li>{uiText("public:publicPages.chooseATemplateThatSuitsTheAmount")}</li><li>{uiText("public:publicPages.enterYourDetailsDirectlyOnAThe")}</li><li>{uiText("public:publicPages.reviewTheDocumentFromTopToBottom")}</li></ol><Link className={classes.secondary} to="/templates">{uiText("interview:interviewFlow.chooseATemplate")}<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="wywiad" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiMessageSquare /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topicPro")}</span></div>
      <h2>{uiText("public:publicPages.interviewTurnExperienceIntoCvContent")}</h2>
      <p>{uiText("public:publicPages.ifDescribingYourWorkIsDifficultAn")}</p>
      <ol>
        <li>{uiText("public:publicPages.openCvThroughAnInterviewStartWith")}</li>
        <li>{uiText("public:publicPages.answerInEnglishOneQuestionAtA")}</li>
        <li>{uiText("public:publicPages.editCollectedInformationIfNeededThenContinue")}</li>
        <li>{uiText("public:publicPages.chooseTheCvContentLanguageAndTemplate")}</li>
      </ol>
      <div className={classes.guideFaq}>
        <details><summary>{uiText("public:publicPages.canIWorkOnSomeoneElseS")}</summary><p>{uiText("public:publicPages.yesSelectTheirDocumentOrImportAs")}</p></details>
        <details><summary>{uiText("public:publicPages.iHaveNoWorkExperienceWhereShould")}</summary><p>{uiText("public:publicPages.describeProjectsStudiesInternshipsOrVolunteeringSay")}</p></details>
        <details><summary>{uiText("public:publicPages.whatIfIDoNotKnowThe")}</summary><p>{uiText("public:publicPages.iDoNotHaveThatExperienceI")}</p></details>
        <details><summary>{uiText("public:publicPages.howDoInterviewsUseAiCredits")}</summary><p>{uiText("public:publicPages.interviewsRequireActiveProAccessAiGenerated")}</p><p>{uiText("public:publicPages.savingAnswersConfirmingFactsAndManuallyManaging")} <Link to="/app/account">{uiText("public:publicPages.checkPlanUsage")}</Link> {uiText("editor:dropzone.or")} <Link to="/pricing#wywiad">{uiText("public:publicPages.readAboutProInPricing")}</Link>.</p></details>
        <details><summary>{uiText("public:publicPages.canIPauseAnInterviewAndReturn")}</summary><p>{uiText("public:publicPages.yesSavedAnswersRemainOnYourAccount")}</p></details>
      </div>
      <Link className={classes.secondary} to="/app/interview">{uiText("public:publicPages.goToInterviewPro")} <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="dopasowanie" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topicPro2")}</span></div>
      <h2>{uiText("ai:aiAssistant.tailorYourCvToASpecificJob")}</h2>
      <ol><li>{uiText("public:publicPages.openYourCvAndTheAiAssistant")}</li><li>{uiText("public:publicPages.aiComparesJobRequirementsWithTheSelected")}</li><li>{uiText("public:publicPages.answersAreSavedImmediatelyOnSubmissionContinue")}</li><li>{uiText("public:publicPages.saveTheResultAsANewCv")}</li></ol>
      <p>{uiText("public:publicPages.theJobAdvertHelpsSelectUsefulInformation")}</p>
      <Link className={classes.secondary} to="/app/documents">{uiText("public:publicPages.chooseACvToTailor")} <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="profil" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topic2")}</span></div>
      <h2>{uiText("public:publicPages.yourCareerProfileAndSavedInterviews")}</h2>
      <p>{uiText("public:publicPages.yourProfileIsASharedCollectionOf")}</p>
      <p>{uiText("public:publicPages.viewingEditingAndDeletingYourProfileRemain")}</p>
      <Link className={classes.secondary} to="/app/career-profile">{uiText("public:publicPages.openCareerProfile")} <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="import" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiUpload /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topic3")}</span></div><h2>{uiText("public:publicPages.transferContentFromYourExistingCv")}</h2><p>{uiText("public:publicPages.afterCreatingAnAccountUploadAPdf")}</p><p>{uiText("public:publicPages.withProAfterFillingACvFrom")} <Link to="/help#wywiad">{uiText("public:publicPages.viewInterviewInstructions")}</Link>.</p><Link className={classes.secondary} to="/app/import">{uiText("public:hero.importCvFromPdf")}<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="pobieranie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiDownload /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topic4")}</span></div><h2>{uiText("public:publicPages.saveYourProjectOrDownloadAPdf")}</h2><p>{uiText("public:publicPages.saveStoresAnEditableCvOnYour")}</p><Link className={classes.secondary} to="/pricing">{uiText("public:publicPages.checkPlanAllowances")}<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="powrot" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>{uiText("public:publicPages.topic5")}</span></div><h2>{uiText("public:publicPages.returnToYourCv")}</h2><p>{uiText("public:publicPages.afterSigningInGoToMyDocuments")}</p><Link className={classes.secondary} to="/app/documents">{uiText("public:publicPages.openMyDocuments")}<FiArrowRight aria-hidden="true" /></Link></section>
    </div></div>
  </SiteLayout>;
}
