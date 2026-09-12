import { useMessageState, messageRef } from '../../../i18n/messageState.js';
import { getUiLocale } from '../../../i18n/index.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Grouped career workspace shared by profile management and interview review. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { careerSections, groupCareerFacts, isCareerNote } from '../../../utils/careerProfileView';
import classes from './FactEditor.module.css';

const PAGE_SIZE = 6;
const FIELD_PAGE_SIZE = 8;

/**
 * Every entry point reads CV fields and edits only notes/answers, locally until Apply.
 * Account profiles detach note paths; interviews retain existing answer bindings
 * for clarification and generation without asking users to assign CV fields.
 */
export default function FactEditor({ facts, onChange, disabled = false, onEditingChange, isolated = false, detachNotePaths = false, readOnly = false }) {
  useTranslation();
  const id = useId();
  const groups = useMemo(() => groupCareerFacts(facts, { sourceProfile: true }), [facts]);
  const [sectionId, setSectionId] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [fieldPage, setFieldPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [undo, setUndo] = useState(null);
  const [message, setMessage] = useMessageState('');
  const heading = useRef(null);
  const addRef = useRef(null);
  const editInput = useRef(null);
  const trigger = useRef(null);
  const section = careerSections.find((s) => s.id === sectionId) || careerSections.find((s) => s.id === (groups.some((g) => g.section === 'experience') ? 'experience' : groups[0]?.section)) || careerSections[0];
  const selected = groups.find((g) => g.facts.some((f) => f.id === selectedId));
  const matching = groups.filter((g) => query.trim() ? g.facts.some((f) => `${f.question || ''} ${f.text} ${f.context}`.toLocaleLowerCase(getUiLocale()).includes(query.trim().toLocaleLowerCase(getUiLocale()))) : g.section === section.id);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1));
  const currentFieldPage = Math.min(fieldPage, Math.max(0, Math.ceil((selected?.fields.length || 0) / FIELD_PAGE_SIZE) - 1));
  const selectedHasInterviewAnswer = selected?.fields.some((field) => field.question);
  const busy = disabled || Boolean(editing);
  const canEditSection = !readOnly && section.id === 'notes';
  const canEditField = (field) => !readOnly && field.ids.every((id) => isCareerNote(facts.find((fact) => fact.id === id)));

  useEffect(() => { onEditingChange?.(Boolean(editing)); }, [editing, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  const editingKey = editing?.key;
  // Typing must not reset the caret; only opening a different field moves focus.
  useEffect(() => { if (editingKey) editInput.current?.focus(); }, [editingKey]);

  function restoreFocus() {
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : selected ? heading.current : addRef.current)?.focus());
  }
  function openGroup(group) {
    // A search result can belong to another section. Keep the visible section
    // navigation synchronized with the record that now owns keyboard focus.
    setSectionId(group.section); setSelectedId(group.facts[0].id); setQuery(''); setPage(0); setFieldPage(0); setMessage('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  function openEditor(field, event) {
    if (readOnly || !isCareerNote(field)) return;
    trigger.current = event?.currentTarget;
    setEditing({ key: field.id, ids: field.ids || [], draft: { ...field } });
  }
  function closeEditor() { setEditing(null); restoreFocus(); }
  function applyEdit() {
    const { draft, ids } = editing;
    if (!draft.text.trim()) return;
    const clean = { id: draft.id, text: draft.text, context: draft.context || '', question: draft.question || '', kind: draft.kind, path: detachNotePaths ? '' : draft.path || '', source: draft.source || 'manual' };
    // Equivalent rows may carry several source IDs. Update each in place;
    // collapsing their display must never delete or replace evidence identity.
    const next = facts.map((f) => ids.includes(f.id) ? { ...f, text: clean.text, context: clean.context, kind: clean.kind, path: clean.path } : f);
    if (!ids.length) next.push(clean);
    onChange(next); setSelectedId(ids[0] || clean.id); setQuery(''); setMessage(messageRef("interview:factEditor.changeReadyToSave")); closeEditor();
  }
  function addRecord(event) {
    if (!canEditSection) return;
    if (facts.length >= 500) { setMessage(messageRef("interview:factEditor.thisSectionHasReachedItsInformationLimit")); return; }
    openEditor({ id: crypto.randomUUID(), text: '', context: '', kind: 'fact', path: '', source: 'manual' }, event);
  }
  function removeField(field) {
    if (!canEditField(field)) return;
    setUndo({ removed: facts.filter((f) => field.ids.includes(f.id)), index: facts.findIndex((f) => field.ids.includes(f.id)) });
    onChange(facts.filter((f) => !field.ids.includes(f.id))); setMessage(messageRef("interview:factEditor.informationDeletedYouCanUndoThisChange"));
    requestAnimationFrame(() => heading.current?.focus());
  }

  return <section className={classes.editor} aria-label={uiText("interview:factEditor.informationToUse")}>
    <div className={classes.toolbar}>
      <div><span className={classes.eyebrow}>{isolated ? uiText("interview:factEditor.thisInterviewOnly") : uiText("interview:factEditor.yourCvInformation")}</span><h2>{isolated ? uiText("interview:factEditor.informationForThisCv") : uiText("interview:factEditor.yourCareerOrganised")}</h2></div>
      <label className={classes.search}>{isolated ? uiText("interview:factEditor.searchCvInformation") : uiText("interview:factEditor.searchProfile")}<input type="search" value={query} disabled={busy} placeholder={uiText("interview:factEditor.companyProjectSkill")} onChange={(e) => { setQuery(e.target.value); setSelectedId(null); setPage(0); }} /></label>
    </div>
    <label className={classes.mobileNav}>{isolated ? uiText("interview:factEditor.cvSection") : uiText("interview:factEditor.profileSection")}<select value={section.id} disabled={busy} onChange={(e) => { setSectionId(e.target.value); setSelectedId(null); setQuery(''); setPage(0); }}>{careerSections.map((s) => <option key={s.id} value={s.id}>{s.label} ({groups.filter((g) => g.section === s.id).length})</option>)}</select></label>
    <div className={classes.workspace}>
      <nav className={classes.navigation} aria-label={isolated ? uiText("interview:factEditor.cvSections") : uiText("interview:factEditor.profileSections")}>
        {careerSections.map((item, index) => <button key={item.id} type="button" disabled={busy} aria-current={!query && section.id === item.id ? 'page' : undefined} onClick={() => { setSectionId(item.id); setSelectedId(null); setQuery(''); setPage(0); setMessage(''); }}><span className={classes.index}>{String(index + 1).padStart(2, '0')}</span><span>{item.label}</span><span className={classes.count}>{groups.filter((g) => g.section === item.id).length}</span></button>)}
        <p className={classes.navHint}>{uiText("interview:factEditor.chooseASectionThenAnEntry")}<br />{uiText("interview:factEditor.eachRoleHasItsOwnPlace")}</p>
      </nav>
      <div className={classes.content}>
        <header className={classes.sectionHeader}>
          <div><span className={classes.eyebrow}>{selected ? uiText("interview:factEditor.selectedEntry") : query ? (isolated ? uiText("interview:factEditor.inCvInformation") : uiText("interview:factEditor.acrossYourProfile")) : `${String(careerSections.indexOf(section) + 1).padStart(2, '0')} / ${isolated ? 'Informacje do CV' : 'Profil zawodowy'}`}</span><h3 ref={heading} tabIndex={-1}>{selected ? (selectedHasInterviewAnswer ? uiText("interview:factEditor.interviewAnswer") : selected.title) : query ? uiText("interview:factEditor.searchResults") : section.label}</h3><p>{selected ? (selectedHasInterviewAnswer ? uiText("interview:factEditor.theQuestionAnswerAndContextAppearTogether") : selected.subtitle || uiText("interview:factEditor.factsInOneEntry", { value0: (selected.fields.length) })) : section.description}</p></div>
          {selected ? <button disabled={busy} type="button" onClick={() => { setSelectedId(null); requestAnimationFrame(() => heading.current?.focus()); }}>{uiText("interview:factEditor.entryList")}</button> : canEditSection && <button ref={addRef} type="button" disabled={busy || facts.length >= 500} onClick={addRecord}>{uiText("interview:factEditor.addInformation")}</button>}
        </header>
        {section.id !== 'notes' && <p className={classes.navHint}>{uiText("interview:factEditor.sourceReadOnly")}</p>}
        <div className={classes.feedback} role="status">{message}{undo && <button disabled={busy || facts.length + undo.removed.length > 500} type="button" onClick={() => { const next = [...facts]; next.splice(Math.min(undo.index, next.length), 0, ...undo.removed.filter((f) => !next.some((n) => n.id === f.id))); onChange(next); setUndo(null); setMessage(messageRef("interview:factEditor.informationRestored")); }}>{uiText("interview:factEditor.undoDeletion")}</button>}</div>
        {editing ? <form className={classes.editForm} onKeyDown={(e) => { if (e.key === 'Escape' && !disabled) { e.preventDefault(); closeEditor(); } }} onSubmit={(e) => { e.preventDefault(); applyEdit(); }}>
          <h4>{editing.ids.length ? uiText("interview:factEditor.editInformation") : uiText("interview:factEditor.newInformation")}</h4>
          {editing.draft.question && <div className={classes.editQuestion}><span className={classes.eyebrow}>{uiText("interview:factEditor.interviewQuestion")}</span><p>{editing.draft.question}</p></div>}
          <label htmlFor={`${id}-text`}>{editing.draft.question ? uiText("interview:factEditor.yourAnswer") : uiText("interview:factEditor.content")}</label><textarea ref={editInput} id={`${id}-text`} maxLength={4000} rows={4} value={editing.draft.text} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, text: e.target.value } })} required disabled={disabled} />
          <details><summary>{uiText("interview:factEditor.contextAndUse")}</summary>
            <label>{uiText("interview:factEditor.roleOrProject")}<textarea maxLength={500} rows={2} value={editing.draft.context?.startsWith('/') ? '' : editing.draft.context || ''} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, context: e.target.value } })} disabled={disabled} /></label>
          </details>
          <div className={classes.formActions}><button className={classes.primary} disabled={disabled || !editing.draft.text.trim()} type="submit">{uiText("interview:factEditor.applyChange")}</button><button disabled={disabled} type="button" onClick={closeEditor}>{uiText("interview:factEditor.cancelEditing")}</button></div>
        </form> : selected ? <>
          {selected.conflicts.size > 0 && <p className={classes.warning}>{uiText("interview:factEditor.thisEntryContainsDifferentVersionsOfThe")}</p>}
          <dl className={classes.fields}>{selected.fields.slice(currentFieldPage * FIELD_PAGE_SIZE, (currentFieldPage + 1) * FIELD_PAGE_SIZE).map((field) => <div key={field.id} className={`${classes.field} ${field.question ? classes.interviewAnswer : ''}`}>
            <dt>{field.question ? <><span className={classes.eyebrow}>{uiText("interview:factEditor.interviewQuestion")}</span><strong>{field.question}</strong></> : field.label}{field.kind !== 'fact' && <span className={classes.badge}>{field.kind === 'gap' ? uiText("interview:factEditor.noExperience") : uiText("interview:factEditor.keepExactWording")}</span>}{selected.conflicts.has(field.path) && <span className={classes.badge}>{uiText("interview:factEditor.reviewVersion")}</span>}</dt>
            <dd>{field.question && <span className={classes.answerLabel}>{uiText("interview:factEditor.yourAnswer")}</span>}<p>{field.text || uiText("interview:factEditor.complete")}</p>{field.question && field.context && field.context !== field.question && <p className={classes.answerContext}><span>{uiText("interview:factEditor.context")}</span>{field.context}</p>}{field.ids.length > 1 && <span className={classes.muted}>{uiText("interview:factEditor.matchingInformationIn")} {field.ids.length} {uiText("interview:factEditor.sources")}</span>}</dd>
            {canEditField(field) && <div className={classes.fieldActions}><button type="button" disabled={disabled} aria-label={uiText("interview:factEditor.edit2", { value0: (field.label), value1: (field.text.slice(0, 55)) })} onClick={(e) => openEditor(field, e)}>{uiText("interview:factEditor.edit")}</button><button type="button" className={classes.danger} disabled={disabled} aria-label={uiText("interview:factEditor.deleteInformation", { value0: (field.text.slice(0, 55)) })} onClick={() => removeField(field)}>{uiText("ai:aiAssistant.delete")}</button></div>}
          </div>)}</dl>
          {selected.fields.length > FIELD_PAGE_SIZE && <Pagination current={currentFieldPage} total={Math.ceil(selected.fields.length / FIELD_PAGE_SIZE)} disabled={disabled} onChange={(n) => { setFieldPage(n); heading.current?.focus(); }} />}
        </> : <>
          {!matching.length && <div className={classes.empty}><span className={classes.eyebrow}>{query ? uiText("interview:factEditor.noResults") : uiText("interview:factEditor.roomForYourNextStep")}</span><h4>{query ? uiText("interview:factEditor.entryNotFound") : uiText("interview:factEditor.complete2", { value0: (section.short.toLowerCase()) })}</h4><p>{query ? uiText("interview:factEditor.changeYourSearchOrReturnToA") : !canEditSection ? uiText("interview:factEditor.sourceEmpty") : uiText("interview:factEditor.addYourFirstPieceOfInformationYou")}</p></div>}
          <div className={classes.records}>{matching.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((group, index) => <button className={classes.record} type="button" key={group.key} disabled={disabled} onClick={() => openGroup(group)} aria-label={uiText("interview:factEditor.openEntry", { value0: (group.title) })}><span className={classes.recordNumber}>{String(currentPage * PAGE_SIZE + index + 1).padStart(2, '0')}</span><span className={classes.recordBody}><strong>{group.title}</strong>{group.subtitle && <span>{group.subtitle}</span>}{group.preview && <span className={classes.excerpt}>{group.preview}</span>}<span className={classes.recordMeta}>{group.fields.length} {uiText("interview:factEditor.items")}{group.conflicts.size > 0 ? uiText("interview:factEditor.reviewVersions") : ''}</span></span><span aria-hidden="true" className={classes.arrow}>↗</span></button>)}</div>
          {matching.length > PAGE_SIZE && <Pagination current={currentPage} total={Math.ceil(matching.length / PAGE_SIZE)} disabled={disabled} onChange={(n) => { setPage(n); heading.current?.focus(); }} />}
        </>}
      </div>
    </div>
  </section>;
}

/** Native buttons retain normal tab order on paginated record and field lists. */
function Pagination({ current, total, onChange, disabled }) {
  useTranslation();
  return <nav className={classes.pagination} aria-label={uiText("interview:factEditor.entryPages")}><button type="button" disabled={disabled || current === 0} onClick={() => onChange(current - 1)}>{uiText("interview:factEditor.previous")}</button><span>{current + 1} / {total}</span><button type="button" disabled={disabled || current + 1 === total} onClick={() => onChange(current + 1)}>{uiText("interview:factEditor.next")}</button></nav>;
}
