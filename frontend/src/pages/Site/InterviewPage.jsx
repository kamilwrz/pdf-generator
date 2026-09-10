/** Standalone creation/resume route shares the assistant's interview controller. */
import { useParams } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import InterviewFlow from '../../components/ai/Interview/InterviewFlow';
import classes from '../../components/ai/Interview/Interview.module.css';

export default function InterviewPage() {
  const { sessionId } = useParams();
  return <SiteLayout workspace compact title="CV z pomocą wywiadu" eyebrow="WYWIAD · PRO" intro="Odpowiedz na pytania o swoje działania i rezultaty. Zatwierdź informacje, sprawdź treść i zapisz nowe CV. Pytania AI i generowanie korzystają z kredytów Pro."><div className={classes.interviewWorkspace}><InterviewFlow key={sessionId || 'new'} sessionId={sessionId} /></div></SiteLayout>;
}
