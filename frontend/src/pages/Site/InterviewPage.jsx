import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Standalone creation/resume route shares the assistant's interview controller. */
import { useParams } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import InterviewFlow from '../../components/ai/Interview/InterviewFlow';
import classes from '../../components/ai/Interview/Interview.module.css';

export default function InterviewPage() {
  useTranslation();
  const { sessionId } = useParams();
  // Saved sessions can originate from either mode; do not relabel a resumed
  // tailoring conversation as general improvement before its data is loaded.
  const mode = uiText(sessionId ? 'documents:documentsPage.savedConversation' : 'public:hero.openInterview');
  return <SiteLayout workspace compact dense focused title={uiText("interview:interviewPage.cvThroughAnInterview")} eyebrow={uiText("interview:interviewPage.interviewPro")}
    breadcrumbs={[{ label: uiText('public:siteLayout.interview'), to: '/app/assistant' }, { label: mode }]}>
    <div className={classes.interviewWorkspace}><InterviewFlow key={sessionId || 'new'} sessionId={sessionId} /></div>
  </SiteLayout>;
}
