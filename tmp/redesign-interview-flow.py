from pathlib import Path
p=Path('frontend/src/components/ai/Interview/InterviewFlow.jsx')
s=p.read_text(encoding='utf-8')
def rep(old,new):
    global s
    assert old in s, old[:100]
    s=s.replace(old,new)
rep("import { factLabel } from '../../../utils/interviewPresentation';", "import InterviewLoading from './InterviewLoading';\nimport InterviewPreview from './InterviewPreview';")
rep("import CvContent from './CvContent';\n",'')
rep("  const [busy, setBusy] = useState(false);", "  const [busy, setBusy] = useState(false);\n  const [initialLoading, setInitialLoading] = useState(true);\n  const [pendingOperation, setPendingOperation] = useState('load');\n  const [panel, setPanel] = useState('conversation');")
rep("    setTemplate(next?.template_id || '');", "    setTemplate(next?.template_id || '');\n    setPanel(next?.phase === 'preview' || next?.phase === 'completed' ? 'preview' : 'conversation');")
rep("    load().catch((err) => { if (alive.current) setError(err.message); });", "    load().catch((err) => { if (alive.current) setError(err.message); }).finally(() => { if (alive.current) setInitialLoading(false); });")
rep("  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [session?.phase, session?.question?.id, reviewOpen]);", "  // Return focus to the active task after a request; hidden forms keep their drafts.\n  useEffect(() => { if (!busy && !initialLoading) heading.current?.focus(); }, [session?.phase, session?.question?.id, reviewOpen, panel, busy, initialLoading]);")
rep("  async function run(work) {", "  async function run(work, operationName = 'load') {")
rep("lock.current = true; setBusy(true);", "lock.current = true; setBusy(true); setPendingOperation(operationName);")
rep("  async function operation(action, extra = {}) {", "  async function operation(action, extra = {}) {\n    setPendingOperation(action);")
rep("    const currentProfile = result.profile || await interviewRequest('/career-profile');", "    if (!result.profile) setPendingOperation('sync');\n    const currentProfile = result.profile || await interviewRequest('/career-profile');")
rep("  const start = () => run(async () => {", "  const start = () => run(async () => {")
rep("setReviewOpen(true); }\n  });\n\n  const saveAnswer", "setReviewOpen(true); }\n  }, 'start');\n\n  const saveAnswer")
rep('  return <section className={classes.flow} aria-label="Wywiad zawodowy" aria-busy={busy}>', '''  const activePanel = reviewing ? 'facts' : session?.phase === 'clarification' ? 'conversation' : panel;
  const waiting = busy || initialLoading;
  return <section className={`${classes.flow} ${classes.interview}`} aria-label="Wywiad zawodowy">''')
rep('className={classes.actions}><Link className={classes.link} to="/app/career-profile"', 'className={classes.utility}><Link aria-disabled={waiting} onClick={(event) => { if (waiting) event.preventDefault(); }} className={classes.link} to="/app/career-profile"')
rep('<button type="button" onClick={onClose}>Wróć do asystenta', '<button type="button" disabled={waiting} onClick={onClose}>Wróć do asystenta')
rep("<h2 ref={heading} tabIndex={-1}>{reviewing ?", "<h2 ref={heading} tabIndex={-1} className={classes.taskTitle}>{activePanel === 'prepare' ? 'Przygotuj swoją wersję CV' : reviewing ?")
rep("{busy ? 'Zapisujemy dane lub przygotowujemy odpowiedź…' : notice}", "{!waiting ? notice : ''}")
rep('    {!canAi && entitlements', '''    {waiting && <InterviewLoading operation={initialLoading ? 'load' : pendingOperation} facts={profile?.facts.length || 0} answers={session?.answers.length || 0} language={languageLabels[session?.language || language]} template={TEMPLATES.find((item) => item.id === template)?.name} />}
    <div hidden={waiting} aria-busy={waiting}>
    {session && <nav className={classes.stages} aria-label="Etapy wywiadu">{[['facts', 'Twoje informacje'], ['conversation', 'Rozmowa'], ['prepare', 'Przygotuj CV'], ['preview', 'Wynik']].map(([key, label], index) => <button type="button" key={key} aria-current={activePanel === key ? 'step' : undefined} disabled={busy || factEditing || (Boolean(session.question) && key !== 'conversation') || (session.phase === 'intake' && key !== 'facts') || (session.phase === 'clarification' && key !== 'conversation') || (key === 'preview' && !session.preview)} onClick={() => { setReviewOpen(key === 'facts'); setPanel(key); }}><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}</nav>}
    {!canAi && entitlements''')
rep("      {session.requirements.length > 0 &&", "      {activePanel === 'conversation' && session.requirements.length > 0 &&")
rep("        {session.phase === 'clarification' &&", "        {activePanel === 'conversation' && <>\n        {session.phase === 'clarification' &&")
rep("        {session.phase !== 'completed' && session.phase !== 'clarification' && <fieldset disabled={busy}>", '''        {!session.question && session.phase !== 'clarification' && session.phase !== 'completed' && <div className={classes.nextStep}><div><h3>{hasPending ? 'Zbierz odpowiedzi w swoim profilu' : 'Gotowe do przygotowania CV?'}</h3><p>{hasPending ? 'Sprawdź nowe informacje, zanim wykorzystamy je w treści.' : 'Możesz przejść dalej albo odpowiedzieć na kolejne pytania.'}</p></div><button className={classes.primary} type="button" onClick={() => hasPending ? setReviewOpen(true) : setPanel('prepare')}>{hasPending ? 'Przejrzyj nowe informacje' : 'Przejdź do przygotowania CV'}</button></div>}
        </>}
        {activePanel === 'prepare' && session.phase !== 'completed' && session.phase !== 'clarification' && <fieldset disabled={busy} className={classes.preparation}>''')
start=s.index('        {session.preview && session.phase')
end=s.index('        {session.document_id &&',start)
s=s[:start]+'''        {activePanel === 'preview' && session.preview && session.phase !== 'clarification' && <>
          <InterviewPreview key={`${session.id}-${session.revision}`} preview={session.preview} source={session.source_cv_data} facts={profile.facts} />
          <div className={classes.resultActions}><p>Nowy dokument zachowa treść źródłowego CV bez zmian.</p><div className={classes.actions}>
            <button className={classes.primary} disabled={busy || hasPending || sourceChanged || session.preview.profile_revision !== profile.revision || session.phase === 'completed'} onClick={() => run(() => operation('document'))}>Zapisz jako nowe CV</button>
            {session.phase !== 'completed' && <button type="button" disabled={busy} onClick={() => setPanel('prepare')}>Zmień szablon lub odśwież</button>}
          </div></div>
        </>}
''' + s[end:]
rep('    </>}\n  </section>;', '    </>}\n    </div>\n  </section>;')
p.write_text(s,encoding='utf-8')
