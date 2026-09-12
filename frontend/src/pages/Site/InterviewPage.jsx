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
  return <SiteLayout workspace compact title={uiText("interview:interviewPage.cvThroughAnInterview")} eyebrow={uiText("interview:interviewPage.interviewPro")} intro={uiText("interview:interviewPage.exploreYourExperienceInAnInterviewAnd")}><div className={classes.interviewWorkspace}><InterviewFlow key={sessionId || 'new'} sessionId={sessionId} /></div></SiteLayout>;
}
