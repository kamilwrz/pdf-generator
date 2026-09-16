import { useTranslation } from 'react-i18next';
import { FiFileText, FiTarget } from 'react-icons/fi';
import { useEntitlements } from '../../../hooks/useEntitlements';
import { WorkflowChoice } from './SitePrimitives';
import classes from './SiteLayout.module.css';

/**
 * Presents the two CV Assistant modes in one feature region on the library and
 * assistant entry page. Only resolved Pro access opens content improvement;
 * tailoring intake remains available on Free. Links never start paid AI.
 */
export default function AssistantChoices({ title }) {
  const { t } = useTranslation();
  const { entitlements } = useEntitlements();
  const canImprove = entitlements?.ai_assistant === true;
  const accessResolved = typeof entitlements?.ai_assistant === 'boolean';
  const action = canImprove ? t('public:hero.openInterview')
    : accessResolved ? t('editor:startChooser.explorePro') : t('editor:startChooser.checkAccess');

  return <section className={classes.assistant} aria-labelledby="assistant-heading">
    <header className={classes.assistantHeading}>
      <h2 id="assistant-heading">{title || t('public:siteLayout.interview')}</h2>
      <p>{t('documents:documentsPage.assistantIntro')}</p>
    </header>
    <div className={classes.workflowChoices}>
      <WorkflowChoice id="assistant-choice" icon={<FiFileText />} title={t('public:hero.openInterview')}
        description={t('documents:documentsPage.assistantDescription')} note={t('documents:documentsPage.assistantPlan')}
        to={canImprove ? '/app/interview' : '/app/account'} action={action} />
      <WorkflowChoice id="tailoring-choice" icon={<FiTarget />} title={t('tailoring:title')}
        description={t('documents:documentsPage.tailoringDescription')} note={t('documents:documentsPage.tailoringPlan')}
        to="/app/tailor" action={t('tailoring:title')} />
    </div>
  </section>;
}
