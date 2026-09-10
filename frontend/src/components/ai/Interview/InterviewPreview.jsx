import { useId, useMemo, useRef, useState } from 'react';
import { previewRecords, recordContent } from '../../../utils/interviewPreview';
import { careerFieldLabel, careerSections } from '../../../utils/careerProfileView';
import CvContent from './CvContent';
import InterviewReviewNotice from './InterviewReviewNotice';
import classes from './InterviewPreview.module.css';

/** One record and one review mode at a time; pagination never removes CV content. */
export default function InterviewPreview({ preview, source, facts }) {
  const recordId = useId();
  const groups = useMemo(() => previewRecords(preview.cv_data, preview.changes), [preview]);
  const [view, setView] = useState('content');
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(0);
  const heading = useRef(null);
  const visible = view === 'changes' ? groups.filter((g) => g.changes.length) : groups;
  const group = visible.find((g) => g.key === selected) || visible[0];
  const rows = view === 'checks' ? preview.remaining_gaps : group?.changes || [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
  function changeView(next) { setView(next); setPage(0); requestAnimationFrame(() => heading.current?.focus()); }
  return <section className={classes.preview} aria-label="Przegląd nowego CV">
    <header className={classes.header}><div><span className={classes.eyebrow}>WYNIK WYWIADU</span><h3>Podgląd treści · liczba stron: {preview.pages}</h3><p>Sprawdź treść i przypisanie osiągnięć do właściwych ról.</p></div><span className={classes.count}>Wpisy: {groups.length}</span></header>
    <nav className={classes.views} aria-label="Widoki podglądu">{[['content', 'Treść CV'], ['changes', `Zmiany (${preview.changes.length})`], ['checks', `Do sprawdzenia (${preview.remaining_gaps.length + (preview.review_notes?.length || 0)})`]].map(([key, label]) => <button type="button" key={key} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}>{label}</button>)}</nav>
    {view !== 'checks' && visible.length > 0 && <div className={classes.selector}><label htmlFor={recordId}>Wpis CV</label><select id={recordId} value={group.key} onChange={(e) => { setSelected(e.target.value); setPage(0); }}>{careerSections.map((section) => visible.some((g) => g.section === section.id) && <optgroup label={section.label} key={section.id}>{visible.filter((g) => g.section === section.id).map((g) => <option key={g.key} value={g.key}>{g.title}{g.subtitle ? ` · ${g.subtitle}` : ''}</option>)}</optgroup>)}</select></div>}
    <div className={classes.body}>
      <h4 ref={heading} tabIndex={-1} className={view === 'content' ? classes.visuallyHidden : undefined}>{view === 'checks' ? 'Sprawdź przed zapisaniem' : group?.title || 'Brak zmian do porównania'}</h4>
      {view === 'content' && <div className={classes.reading}><CvContent key={group?.key} data={recordContent(preview.cv_data, group)} /></div>}
      {view === 'changes' && <>{!rows.length && <p>Treść nie zawiera zmian do porównania.</p>}{rows.slice(currentPage * 5, (currentPage + 1) * 5).map((field, i) => {
        const previous = field.path.split('/').slice(1).reduce((value, key) => value?.[key], source);
        return <article className={classes.change} key={`${field.path}-${i}`}><h5>{careerFieldLabel(field.path)}</h5><dl><div><dt>W źródłowym CV</dt><dd>{previous == null || previous === '' ? 'Brak treści' : String(previous)}</dd></div><div><dt>Nowa treść</dt><dd>{field.value}</dd></div></dl><details><summary>Na jakich informacjach oparto tę zmianę?</summary><ul>{field.evidence_refs.map((id) => <li key={id}>{facts.find((fact) => fact.id === id)?.text || 'Informacja usunięta — odśwież podgląd'}</li>)}</ul></details></article>;
      })}</>}
      {view === 'checks' && <><InterviewReviewNotice preview={preview} />{!rows.length && <p>Nie wskazano dodatkowych braków informacji. Przejrzyj treść przed zapisaniem.</p>}<ul className={classes.gaps}>{rows.slice(currentPage * 5, (currentPage + 1) * 5).map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
      {view !== 'content' && rows.length > 5 && <nav className={classes.pagination} aria-label="Strony podglądu"><button type="button" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); heading.current?.focus(); }}>Poprzednie</button><span>{currentPage + 1} / {Math.ceil(rows.length / 5)}</span><button type="button" disabled={(currentPage + 1) * 5 >= rows.length} onClick={() => { setPage(currentPage + 1); heading.current?.focus(); }}>Następne</button></nav>}
    </div>
    {view !== 'checks' && (preview.review_notes?.length > 0 || preview.remaining_gaps.length > 0 || preview.recovered_previous_attempt) && <div className={classes.checkNotice}><p>Wynik zawiera informacje o doprecyzowaniach lub brakach. Sprawdź je przed zapisaniem.</p><button type="button" onClick={() => changeView('checks')}>Sprawdź uwagi do CV</button></div>}
  </section>;
}
