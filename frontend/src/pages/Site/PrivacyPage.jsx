import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Public privacy policy reflecting the application's implemented data flows. */
import { Link } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';

export default function PrivacyPage() {
  useTranslation();
  return <SiteLayout title={uiText("public:privacyPage.privacyPolicy")} intro={uiText("public:privacyPage.effectiveFromSeptemberThisPolicyExplainsWhat")}>
    <aside className={classes.notice} aria-labelledby="privacy-summary"><h2 id="privacy-summary">{uiText("public:privacyPage.keyInformation")}</h2><p>{uiText("public:privacyPage.theDataControllerIsKamilWrzochalskiCv")}</p><p>{uiText("public:privacyPage.doNotEnterSpecialCategoryPersonalData")}</p></aside>

    <nav className={classes.privacyToc} aria-label={uiText("public:privacyPage.policyContents")}><a href="#administrator">{uiText("public:privacyPage.controller")}</a><a href="#dane">{uiText("public:privacyPage.dataAndPurposes")}</a><a href="#ai">{uiText("public:privacyPage.aiAndImport")}</a><a href="#odbiorcy">{uiText("public:privacyPage.recipients")}</a><a href="#retencja">{uiText("public:privacyPage.retention")}</a><a href="#prawa">{uiText("public:privacyPage.yourRights")}</a></nav>

    <section id="administrator" className={classes.section}><h2>{uiText("public:privacyPage.controllerAndContact")}</h2><p>{uiText("public:privacyPage.thePersonalDataControllerIs")} <strong>Kamil Wrzochalski</strong>{uiText("public:privacyPage.aPrivateIndividualAtKordeckiegoMWarsaw")}</p><p>{uiText("public:privacyPage.forPrivacyEnquiriesWriteTo")} <a href="mailto:kwrzochalski@gmail.com">kwrzochalski@gmail.com</a>{uiText("public:privacyPage.correspondenceAtThisAddressIsHandledBy")}</p></section>

    <section id="dane" className={classes.section}><h2>{uiText("public:privacyPage.whatDataWeProcessWhyAndOn")}</h2><div className={classes.tableWrap}><table className={classes.privacyTable}><caption>{uiText("public:privacyPage.personalDataProcessingPurposesAndLegalBases")}</caption><thead><tr><th>{uiText("public:privacyPage.data")}</th><th>{uiText("public:privacyPage.purpose")}</th><th>{uiText("public:privacyPage.legalBasis")}</th></tr></thead><tbody>
      <tr><td>{uiText("public:privacyPage.usernameEmailPasswordHashEmailVerificationStatus")}</td><td>{uiText("public:privacyPage.registrationSignInAccountProtectionAndManagement")}</td><td>{uiText("public:privacyPage.performanceOfTheServiceContractArticleB")}</td></tr>
      <tr><td>{uiText("public:privacyPage.cvContentAndLayoutContactDetailsEntered")}</td><td>{uiText("public:privacyPage.creatingSavingEditingImportingAndExportingDocuments")}</td><td>{uiText("public:privacyPage.performanceOfAContractArticleBGdpr")}</td></tr>
      <tr><td>{uiText("public:privacyPage.instructionsSelectedPassagesOrFullCvContent")}</td><td>{uiText("public:privacyPage.importingTailoringCvsAndPerformingTheSelected")}</td><td>{uiText("public:privacyPage.performanceOfAContractAtTheUser")}</td></tr>
      <tr><td>{uiText("public:privacyPage.planAllowancesAndFeatureUsageStripeSession")}</td><td>{uiText("public:privacyPage.startingPaymentsActivatingPlansPreventingDuplicateBilling")}</td><td>{uiText("public:privacyPage.performanceOfAContractArticleBLegal")}</td></tr>
      <tr><td>{uiText("public:privacyPage.ipAddressRequestHeadersTimePathResponse")}</td><td>{uiText("public:privacyPage.serviceDeliveryAbusePreventionDiagnosticsAndAvailability")}</td><td>{uiText("public:privacyPage.theControllerSLegitimateInterestInOperating")}</td></tr>
      <tr><td>{uiText("public:privacyPage.emailAddressAndCorrespondence")}</td><td>{uiText("public:privacyPage.respondingToEnquiriesDataRequestsOrComplaints")}</td><td>{uiText("public:privacyPage.articleBCOrFGdprDepending")}</td></tr>
    </tbody></table></div><p>{uiText("public:privacyPage.providingAccountDataIsVoluntaryButNecessary")}</p><p>{uiText("public:privacyPage.ifYouIncludeAnotherPersonSData")}</p></section>

    <section id="przegladarka" className={classes.section}><h2>{uiText("public:privacyPage.browserStorage")}</h2><p>{uiText("public:privacyPage.withoutSigningInCvAndSetupDrafts")}</p><p>{uiText("public:privacyPage.cvStudioDoesNotStoreAnAnonymous")}</p></section>

    <section id="ai" className={classes.section}><h2>{uiText("public:privacyPage.pdfImportAiAndJobAdverts")}</h2><p>{uiText("public:privacyPage.theOriginalPdfIsReadForImport")}</p><p>{uiText("public:privacyPage.theAiAssistantSendsOpenaiAnInstruction")}</p><p>{uiText("public:privacyPage.interviewsSaveQuestionsAnswersTheSelectedCv")}</p><p><strong>{uiText("public:privacyPage.specialCategoryDataIsProhibited")}</strong> {uiText("public:privacyPage.theServiceIsNotIntendedToProcess")}</p><p>{uiText("public:privacyPage.aiDoesNotMakeDecisionsProducingLegal")}</p></section>

    <section id="odbiorcy" className={classes.section}><h2>{uiText("public:privacyPage.recipientsAndProcessors")}</h2><ul>
      <li><strong>Render Services, Inc.</strong> {uiText("public:privacyPage.frontendAndBackendHostingPostgresqlAndTechnical")}</li>
      <li><strong>Amazon Web Services, Inc.</strong> {uiText("public:privacyPage.privateSStorageForPhotosAndGenerated")}</li>
      <li><strong>Cloudflare, Inc.</strong> {uiText("public:privacyPage.workersAiUsedInTheDefaultCv")}</li>
      <li><strong>OpenAI, L.L.C.</strong> {uiText("public:privacyPage.aiAssistantCvOperationsAndOptionalDocument")}</li>
      <li><strong>Google</strong> {uiText("public:privacyPage.googleIdentityServicesForSignInOr")}</li>
      <li><strong>Resend, Inc.</strong> {uiText("public:privacyPage.deliveryOfRegistrationVerificationEmailsFromAccounts")}</li>
      <li><strong>Stripe</strong> {uiText("public:privacyPage.checkoutAndPaymentProcessingStripeMayAlso")}</li>
      <li><strong>home.pl S.A.</strong> {uiText("public:privacyPage.domainRegistrationAndDnsServices")}</li>
      <li><strong>{uiText("public:privacyPage.operatorOfAPublicJobAdvertPage")}</strong> {uiText("public:privacyPage.onlyWhenTheUserAsksCvStudio")}</li>
    </ul><p>{uiText("public:privacyPage.dataMayBeDisclosedToPublicAuthorities")}</p><p className={classes.providerLinks}>{uiText("public:privacyPage.providerInformation")} <a href="https://render.com/privacy">Render</a>, <a href="https://aws.amazon.com/privacy/">AWS</a>, <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>, <a href="https://openai.com/policies/privacy-policy/">OpenAI</a>, <a href="https://policies.google.com/privacy">Google</a>, <a href="https://resend.com/legal/privacy-policy">Resend</a>, <a href="https://stripe.com/privacy">Stripe</a> i <a href="https://home.pl/polityka-prywatnosci/">home.pl</a>.</p></section>

    <section id="transfery" className={classes.section}><h2>{uiText("public:privacyPage.transfersOutsideTheEea")}</h2><p>{uiText("public:privacyPage.theServiceIsAvailableWorldwideAndSome")}</p><p>{uiText("public:privacyPage.theExactCloudRegionDependsOnThe")}</p></section>

    <section id="retencja" className={classes.section}><h2>{uiText("public:privacyPage.howLongWeRetainData")}</h2><ul>
      <li>{uiText("public:privacyPage.accountsProjectsCvElementsPhotosDraftsAnd")}</li>
      <li>{uiText("public:privacyPage.sessionTokensNormallyExpireAfterDaysSingle")}</li>
      <li>{uiText("public:privacyPage.stripeRecordsIncludingRawWebhookEventContent")}</li>
      <li>{uiText("public:privacyPage.technicalLogsAreRetainedAccordingToThe")}</li>
      <li>{uiText("public:privacyPage.correspondenceIsRetainedWhileHandlingTheMatter")}</li>
      <li>{uiText("public:privacyPage.afterDeletionRecordsMayRemainForA")}</li>
    </ul><p>{uiText("public:privacyPage.accountDeletionImmediatelyRemovesRelationshipsAndRecords")}</p></section>

    <section id="bezpieczenstwo" className={classes.section}><h2>{uiText("public:privacyPage.security")}</h2><p>{uiText("public:privacyPage.passwordsAreStoredAsArgonIdHashes")}</p></section>

    <section id="prawa" className={classes.section}><h2>{uiText("public:privacyPage.yourRights2")}</h2><p>{uiText("public:privacyPage.withinTheLimitsOfGdprYouMay")}</p><p>{uiText("public:privacyPage.signedInUsersCanDownloadTheirData")} <Link to="/app/account">{uiText("interview:interviewFlow.accountAndPlan")}</Link>{uiText("public:privacyPage.theExportExcludesPasswordsTokensGoogleIdentifiers")} <a href="mailto:kwrzochalski@gmail.com">kwrzochalski@gmail.com</a>{uiText("public:privacyPage.theControllerMayAskYouToConfirm")}</p><p>{uiText("public:privacyPage.youMayLodgeAComplaintWithThe")} <a href="https://uodo.gov.pl/pl/493/155">{uiText("public:privacyPage.presidentOfThePolishPersonalDataProtection")}</a>{uiText("public:privacyPage.ulStanisAwaMoniuszkiAWarsaw")}</p></section>

    <section id="dzieci" className={classes.section}><h2>{uiText("public:privacyPage.userAgeAndAvailability")}</h2><p>{uiText("public:privacyPage.cvStudioIsIntendedOnlyForPeople")}</p></section>

    <section id="zmiany" className={classes.section}><h2>{uiText("public:privacyPage.policyChanges")}</h2><p>{uiText("public:privacyPage.thisPolicyMayChangeWhenFeaturesProviders")}</p></section>
  </SiteLayout>;
}
