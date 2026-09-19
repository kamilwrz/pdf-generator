import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Standalone creation/resume route shares the assistant's interview controller. */
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { readCvSource } from '../../services/cvImport';
import { parseDocumentId } from '../../utils/siteRoutes';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import InterviewFlow from '../../components/ai/Interview/InterviewFlow';
import classes from '../../components/ai/Interview/Interview.module.css';

export default function InterviewPage() {
  useTranslation();
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const kind = params.get('source');
  const sourceId = parseDocumentId(params.get('sourceId'));
  const language = ['pl', 'en'].includes(params.get('language')) ? params.get('language') : undefined;
  // Saved sessions can originate from either mode; do not relabel a resumed
  // tailoring conversation as general improvement before its data is loaded.
  const mode = uiText(sessionId ? 'documents:documentsPage.savedConversation' : 'public:hero.openInterview');
  return <SiteLayout workspace compact dense focused showFooter title={uiText("interview:interviewPage.cvThroughAnInterview")} eyebrow={uiText("interview:interviewPage.interviewPro")}
    breadcrumbs={[{ label: uiText('public:siteLayout.interview'), to: '/app/assistant' }, { label: mode }]}>
    <div className={classes.interviewWorkspace}>{!sessionId && params.has('source')
      ? <OnboardingSource key={`${kind}:${sourceId}:${language}`} kind={kind} sourceId={sourceId} language={language} />
      : <InterviewFlow key={sessionId || 'new'} sessionId={sessionId} />}</div>
  </SiteLayout>;
}

/** Revalidate the owned source after a bookmark/auth return; reading never starts a conversation. */
function OnboardingSource({ kind, sourceId, language }) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const valid = ['document', 'import'].includes(kind) && Boolean(sourceId);
  const sourceError = valid ? error : uiText('onboarding:sourceUnavailable');
  useEffect(() => {
    let active = true;
    if (!valid) return;
    readCvSource({ kind, id: sourceId }).then(result => {
      if (active) setSource({ ...result, initial: { cv_data: result.cvData, language,
        ...(kind === 'document' ? { source_document_id: sourceId } : { source_import_id: sourceId }),
      } });
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [kind, sourceId, language, retry, valid]);
  return <>
    {sourceError ? <div role="alert" className={classes.error}><p>{sourceError}</p><button onClick={() => { setError(''); setRetry(value => value + 1); }}>{uiText('onboarding:retrySource')}</button><Link to="/app/interview">{uiText('onboarding:changeSource')}</Link></div>
      : !source ? <p role="status">{uiText('onboarding:sourceLoading')}</p>
        : <><p>{uiText('onboarding:selectedSource')} <strong>{source.title || source.initial.cv_data.name}</strong> · <Link to="/app/interview">{uiText('onboarding:changeSource')}</Link></p><InterviewFlow initialSource={source.initial} /></>}
  </>;
}
