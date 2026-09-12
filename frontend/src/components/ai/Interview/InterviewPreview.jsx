import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { previewRecords, recordContent } from '../../../utils/interviewPreview';
import { careerFieldLabel, careerSections } from '../../../utils/careerProfileView';
import CvContent from './CvContent';
import InterviewReviewNotice from './InterviewReviewNotice';
import classes from './InterviewPreview.module.css';

/** One record and one review mode at a time; pagination never removes CV content. */
export default function InterviewPreview({ preview, source, facts, disabled = false, onReview, onEditingChange }) {
  useTranslation();
  const recordId = useId();
  const groups = useMemo(() => previewRecords(preview.cv_data, preview.changes), [preview]);
  const [view, setView] = useState('content');
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(0);
  const heading = useRef(null);
  const editButtons = useRef(new Map());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  function cancelEdit() {
    setEditing(null); setDraft(''); onEditingChange?.(false);
    requestAnimationFrame(() => editButtons.current.get(editing)?.focus());
  }
  const visible = view === 'changes' ? groups.filter((g) => g.changes.length) : groups;
  const group = visible.find((g) => g.key === selected) || visible[0];
  const rows = view === 'checks' ? preview.remaining_gaps : group?.changes || [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
  function changeView(next) { setView(next); setPage(0); requestAnimationFrame(() => heading.current?.focus()); }
  return <section className={classes.preview} aria-label={uiText("interview:interviewPreview.reviewYourNewCv")}>
    <header className={classes.header}><div><h3>{uiText("interview:interviewPreview.contentPreviewPages")} {preview.pages}</h3><p>{uiText("interview:interviewPreview.checkTheContentAndThatAchievementsBelong")}</p></div><span className={classes.count}>{uiText("interview:interviewPreview.entries")} {groups.length}</span></header>
    <nav className={classes.views} aria-label={uiText("interview:interviewPreview.previewViews")}>{[['content', uiText("interview:interviewPreview.cvContent")], ['changes', uiText("interview:interviewPreview.changes", { value0: (preview.changes.length) })], ['checks', uiText("interview:interviewPreview.toReview", { value0: (preview.remaining_gaps.length + (preview.review_notes?.length || 0)) })]].map(([key, label]) => <button type="button" key={key} disabled={disabled || editing !== null} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}>{label}</button>)}</nav>
    {view !== 'checks' && visible.length > 0 && <div className={classes.selector}><label htmlFor={recordId}>{uiText("interview:interviewPreview.cvEntry")}</label><select id={recordId} disabled={disabled || editing !== null} value={group.key} onChange={(e) => { setSelected(e.target.value); setPage(0); }}>{careerSections.map((section) => visible.some((g) => g.section === section.id) && <optgroup label={section.label} key={section.id}>{visible.filter((g) => g.section === section.id).map((g) => <option key={g.key} value={g.key}>{g.title}{g.subtitle ? ` · ${g.subtitle}` : ''}</option>)}</optgroup>)}</select></div>}
    <div className={classes.body}>
      <h4 ref={heading} tabIndex={-1} className={view === 'content' ? classes.visuallyHidden : undefined}>{view === 'checks' ? uiText("interview:interviewPreview.checkBeforeSaving") : group?.title || uiText("interview:interviewPreview.noChangesToCompare")}</h4>
      {view === 'content' && <div className={classes.reading}><CvContent key={group?.key} data={recordContent(preview.cv_data, group)} /></div>}
      {view === 'changes' && <>{!rows.length && <p>{uiText("interview:interviewPreview.theContentContainsNoChangesToCompare")}</p>}{rows.slice(currentPage * 5, (currentPage + 1) * 5).map((field, i) => {
        const previous = field.path.split('/').slice(1).reduce((value, key) => value?.[key], source);
        return <article className={classes.change} key={`${field.path}-${i}`}><h5>{careerFieldLabel(field.path)}</h5><dl><div><dt>{uiText("interview:interviewPreview.inTheSourceCv")}</dt><dd>{previous == null || previous === '' ? uiText("interview:interviewPreview.noContent") : String(previous)}</dd></div><div><dt>{uiText("interview:interviewPreview.newContent")}</dt><dd>{field.value}</dd></div></dl><details><summary>{uiText("interview:interviewPreview.whatInformationSupportsThisChange")}</summary><ul>{field.evidence_refs.map((id) => <li key={id}>{facts.find((fact) => fact.id === id)?.text || uiText("interview:interviewPreview.informationDeletedRefreshThePreview")}</li>)}</ul></details>
          {onReview && <div>
            {editing === field.path ? <form onSubmit={(event) => { event.preventDefault(); if (!disabled && draft.trim()) onReview(field.path, draft); }}>
              <p id={`${recordId}-edit-help`}>{uiText('interview:interviewPreview.editHelp')}</p>
              <label htmlFor={`${recordId}-replacement`}>{uiText('interview:interviewFlow.fullCorrectedDescription')}</label>
              <textarea id={`${recordId}-replacement`} autoFocus rows={4} maxLength={4000} value={draft} disabled={disabled} aria-describedby={`${recordId}-edit-help`} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) { event.preventDefault(); event.stopPropagation(); cancelEdit(); } }} />
              <button type="submit" disabled={disabled || !draft.trim()}>{uiText('interview:interviewPreview.confirmReplacement')}</button>
              <button type="button" disabled={disabled} onClick={cancelEdit}>{uiText('interview:interviewPreview.cancelEdit')}</button>
            </form> : <>
              {!['/name', '/email', '/phone', '/address', '/linkedin', '/github', '/website'].includes(field.path) && <button type="button" disabled={disabled || editing !== null} ref={(node) => { if (node) editButtons.current.set(field.path, node); else editButtons.current.delete(field.path); }} onClick={() => { setEditing(field.path); setDraft(field.value); onEditingChange?.(true); }}>{uiText('interview:interviewPreview.editChange')}</button>}
              <button type="button" disabled={disabled || editing !== null} onClick={() => onReview(field.path, null)}>{uiText('interview:interviewPreview.rejectChange')}</button>
            </>}
          </div>}
        </article>;
      })}</>}
      {view === 'checks' && <><InterviewReviewNotice preview={preview} />{!rows.length && <p>{uiText("interview:interviewPreview.noFurtherInformationGapsWereIdentifiedReview")}</p>}<ul className={classes.gaps}>{rows.slice(currentPage * 5, (currentPage + 1) * 5).map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
      {view !== 'content' && rows.length > 5 && <nav className={classes.pagination} aria-label={uiText("interview:interviewPreview.previewPages")}><button type="button" disabled={disabled || editing !== null || currentPage === 0} onClick={() => { setPage(currentPage - 1); heading.current?.focus(); }}>{uiText("interview:interviewPreview.previous")}</button><span>{currentPage + 1} / {Math.ceil(rows.length / 5)}</span><button type="button" disabled={disabled || editing !== null || (currentPage + 1) * 5 >= rows.length} onClick={() => { setPage(currentPage + 1); heading.current?.focus(); }}>{uiText("interview:interviewPreview.next")}</button></nav>}
    </div>
    {view !== 'checks' && (preview.review_notes?.length > 0 || preview.remaining_gaps.length > 0 || preview.recovered_previous_attempt) && <div className={classes.checkNotice}><p>{uiText("interview:interviewPreview.theResultIncludesClarificationOrGapNotices")}</p><button type="button" disabled={disabled || editing !== null} onClick={() => changeView('checks')}>{uiText("interview:interviewPreview.reviewCvNotices")}</button></div>}
  </section>;
}
