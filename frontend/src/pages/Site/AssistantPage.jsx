import { useTranslation } from 'react-i18next';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import AssistantChoices from '../../components/common/SiteLayout/AssistantChoices';

/** Account entry for selecting an assistant mode without starting a conversation. */
export default function AssistantPage() {
  const { t } = useTranslation();
  return <SiteLayout workspace compact title={t('public:siteLayout.interview')}
    eyebrow={t('account:accountPage.yourWorkspace')}>
    <AssistantChoices title={t('documents:documentsPage.chooseAssistantMode')} />
  </SiteLayout>;
}
