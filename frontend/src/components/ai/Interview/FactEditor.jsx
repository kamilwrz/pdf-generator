/** Grouped career workspace shared by profile management and interview review. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { careerSections, groupCareerFacts, newCareerRecord, careerFieldOptions } from '../../../utils/careerProfileView';
import { interviewFields } from '../../../utils/interviewPresentation';
import classes from './FactEditor.module.css';

const PAGE_SIZE = 6;
const FIELD_PAGE_SIZE = 8;

/** Editing is local until Apply; callers disable persistence while an editor is open. */
export default function FactEditor({ facts, onChange, disabled = false, onEditingChange }) {
  const id = useId();
  const groups = useMemo(() => groupCareerFacts(facts), [facts]);
  const [sectionId, setSectionId] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [fieldPage, setFieldPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [undo, setUndo] = useState(null);
  const [message, setMessage] = useState('');
  const heading = useRef(null);
  const addRef = useRef(null);
  const editInput = useRef(null);
  const trigger = useRef(null);
  const section = careerSections.find((s) => s.id === sectionId) || careerSections.find((s) => s.id === (groups.some((g) => g.section === 'experience') ? 'experience' : groups[0]?.section)) || careerSections[0];
  const selected = groups.find((g) => g.facts.some((f) => f.id === selectedId));
  const matching = groups.filter((g) => query.trim() ? g.facts.some((f) => `${f.text} ${f.context}`.toLocaleLowerCase('pl').includes(query.trim().toLocaleLowerCase('pl'))) : g.section === section.id);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1));
  const currentFieldPage = Math.min(fieldPage, Math.max(0, Math.ceil((selected?.fields.length || 0) / FIELD_PAGE_SIZE) - 1));
  const busy = disabled || Boolean(editing);

  useEffect(() => { onEditingChange?.(Boolean(editing)); }, [editing, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  const editingKey = editing?.key;
  // Typing must not reset the caret; only opening a different field moves focus.
  useEffect(() => { if (editingKey) editInput.current?.focus(); }, [editingKey]);

  function restoreFocus() {
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : selected ? heading.current : addRef.current)?.focus());
  }
  function openGroup(group) {
    setSelectedId(group.facts[0].id); setFieldPage(0); setMessage('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  function openEditor(field, event, additions = []) {
    trigger.current = event?.currentTarget;
    setEditing({ key: field.id, ids: field.ids || [], draft: { ...field }, additions });
  }
  function closeEditor() { setEditing(null); restoreFocus(); }
  function applyEdit() {
    const { draft, ids, additions } = editing;
    if (!draft.text.trim()) return;
    const clean = { id: draft.id, text: draft.text, context: draft.context || '', kind: draft.kind, path: draft.path || '', source: draft.source || 'manual' };
    // Equivalent rows may carry several source IDs. Update each in place;
    // collapsing their display must never delete or replace evidence identity.
    const next = facts.map((f) => ids.includes(f.id) ? { ...f, text: clean.text, context: clean.context, kind: clean.kind, path: clean.path } : f);
    if (!ids.length) next.push(...additions, clean);
    onChange(next); setSelectedId(ids[0] || clean.id); setQuery(''); setMessage('Zmiana gotowa do zapisania.'); closeEditor();
  }
  function addRecord(event) {
    const additions = newCareerRecord(facts, section.id);
    if (!additions.length || facts.length + additions.length > 500) { setMessage('Osiągnięto limit informacji w tej sekcji.'); return; }
    const draft = additions.find((f) => !f.text);
    openEditor(draft, event, additions.filter((f) => f.id !== draft.id));
  }
  function removeField(field) {
    setUndo({ removed: facts.filter((f) => field.ids.includes(f.id)), index: facts.findIndex((f) => field.ids.includes(f.id)) });
    onChange(facts.filter((f) => !field.ids.includes(f.id))); setMessage('Informacja usunięta. Możesz cofnąć tę zmianę.');
    requestAnimationFrame(() => heading.current?.focus());
  }
  const options = selected ? careerFieldOptions(selected, facts) : [];

  return <section className={classes.editor} aria-label="Informacje do wykorzystania">
    <div className={classes.toolbar}>
      <div><span className={classes.eyebrow}>Twoja baza do CV</span><h2>Kariera uporządkowana</h2></div>
      <label className={classes.search}>Szukaj w profilu<input type="search" value={query} disabled={busy} placeholder="Firma, projekt, umiejętność…" onChange={(e) => { setQuery(e.target.value); setSelectedId(null); setPage(0); }} /></label>
    </div>
    <label className={classes.mobileNav}>Sekcja profilu<select value={section.id} disabled={busy} onChange={(e) => { setSectionId(e.target.value); setSelectedId(null); setQuery(''); setPage(0); }}>{careerSections.map((s) => <option key={s.id} value={s.id}>{s.label} ({groups.filter((g) => g.section === s.id).length})</option>)}</select></label>
    <div className={classes.workspace}>
      <nav className={classes.navigation} aria-label="Sekcje profilu">
        {careerSections.map((item, index) => <button key={item.id} type="button" disabled={busy} aria-current={!query && section.id === item.id ? 'page' : undefined} onClick={() => { setSectionId(item.id); setSelectedId(null); setQuery(''); setPage(0); setMessage(''); }}><span className={classes.index}>{String(index + 1).padStart(2, '0')}</span><span>{item.label}</span><span className={classes.count}>{groups.filter((g) => g.section === item.id).length}</span></button>)}
        <p className={classes.navHint}>Wybierz sekcję, potem wpis.<br />Każda rola ma własne miejsce.</p>
      </nav>
      <div className={classes.content}>
        <header className={classes.sectionHeader}>
          <div><span className={classes.eyebrow}>{selected ? 'Wybrany wpis' : query ? 'W całym profilu' : `${String(careerSections.indexOf(section) + 1).padStart(2, '0')} / Profil zawodowy`}</span><h3 ref={heading} tabIndex={-1}>{selected ? selected.title : query ? 'Wyniki wyszukiwania' : section.label}</h3><p>{selected ? selected.subtitle || `${selected.fields.length} informacji w jednym wpisie` : section.description}</p></div>
          {selected ? <button disabled={busy} type="button" onClick={() => { setSelectedId(null); requestAnimationFrame(() => heading.current?.focus()); }}>← Lista wpisów</button> : <button ref={addRef} type="button" disabled={busy || facts.length >= 500} onClick={addRecord}>+ Dodaj informację</button>}
        </header>
        <div className={classes.feedback} role="status">{message}{undo && <button disabled={busy || facts.length + undo.removed.length > 500} type="button" onClick={() => { const next = [...facts]; next.splice(Math.min(undo.index, next.length), 0, ...undo.removed.filter((f) => !next.some((n) => n.id === f.id))); onChange(next); setUndo(null); setMessage('Przywrócono informację.'); }}>Cofnij usunięcie</button>}</div>
        {editing ? <form className={classes.editForm} onKeyDown={(e) => { if (e.key === 'Escape' && !disabled) { e.preventDefault(); closeEditor(); } }} onSubmit={(e) => { e.preventDefault(); applyEdit(); }}>
          <h4>{editing.ids.length ? 'Edytuj informację' : 'Nowa informacja'}</h4>
          <label htmlFor={`${id}-text`}>Treść</label><textarea ref={editInput} id={`${id}-text`} maxLength={4000} rows={4} value={editing.draft.text} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, text: e.target.value } })} required disabled={disabled} />
          <details><summary>Kontekst i sposób wykorzystania</summary>
            <label>Rola lub projekt<textarea maxLength={500} rows={2} value={editing.draft.context?.startsWith('/') ? '' : editing.draft.context || ''} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, context: e.target.value } })} disabled={disabled} /></label>
            <label>Rodzaj informacji<select value={editing.draft.kind} disabled={disabled} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, kind: e.target.value } })}><option value="fact">Potwierdzony fakt</option><option value="gap">Nie mam tego doświadczenia</option><option value="framing">Sformułowanie do zachowania dosłownie</option></select></label>
            {(!editing.draft.path || interviewFields[editing.draft.path]) && <label>Przeznaczenie<select value={editing.draft.path || ''} disabled={disabled} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, path: e.target.value } })}><option value="">Informacja do rozwinięcia w CV</option>{Object.entries(interviewFields).map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></label>}
            {editing.draft.path && !interviewFields[editing.draft.path] && <button type="button" disabled={disabled} onClick={() => setEditing({ ...editing, draft: { ...editing.draft, path: '' } })}>Zachowaj jako dodatkową informację</button>}
          </details>
          <div className={classes.formActions}><button className={classes.primary} disabled={disabled || !editing.draft.text.trim()} type="submit">Zastosuj zmianę</button><button disabled={disabled} type="button" onClick={closeEditor}>Anuluj edycję</button></div>
        </form> : selected ? <>
          {selected.conflicts.size > 0 && <p className={classes.warning}>Ten wpis zawiera różne warianty tego samego pola. Sprawdź oznaczone informacje przed zapisem.</p>}
          <dl className={classes.fields}>{selected.fields.slice(currentFieldPage * FIELD_PAGE_SIZE, (currentFieldPage + 1) * FIELD_PAGE_SIZE).map((field) => <div key={field.id} className={classes.field}>
            <dt>{field.label}{field.kind !== 'fact' && <span className={classes.badge}>{field.kind === 'gap' ? 'Brak doświadczenia' : 'Zachowaj dosłownie'}</span>}{selected.conflicts.has(field.path) && <span className={classes.badge}>Sprawdź wariant</span>}</dt>
            <dd><p>{field.text || 'Uzupełnij'}</p>{field.ids.length > 1 && <span className={classes.muted}>Zgodna informacja w {field.ids.length} źródłach</span>}</dd>
            <div className={classes.fieldActions}><button type="button" disabled={disabled} aria-label={`Edytuj: ${field.label} — ${field.text.slice(0, 55)}`} onClick={(e) => openEditor(field, e)}>Edytuj</button><button type="button" className={classes.danger} disabled={disabled} aria-label={`Usuń informację: ${field.text.slice(0, 55)}`} onClick={() => removeField(field)}>Usuń</button></div>
          </div>)}</dl>
          {selected.fields.length > FIELD_PAGE_SIZE && <Pagination current={currentFieldPage} total={Math.ceil(selected.fields.length / FIELD_PAGE_SIZE)} disabled={disabled} onChange={(n) => { setFieldPage(n); heading.current?.focus(); }} />}
          {options.length > 0 && <label className={classes.addField}>Dodaj do tego wpisu<select value="" disabled={disabled || facts.length >= 500} onChange={(e) => { if (!e.target.value) return; const option = options[Number(e.target.value) - 1]; openEditor({ id: crypto.randomUUID(), text: '', context: selected.section === 'notes' ? selected.facts[0].context : '', kind: 'fact', path: option.path, source: 'manual' }, e); }}><option value="">Wybierz informację…</option>{options.map((option, i) => <option key={option.path || i} value={i + 1}>{option.label}</option>)}</select></label>}
        </> : <>
          {!matching.length && <div className={classes.empty}><span className={classes.eyebrow}>{query ? 'Brak wyników' : 'Miejsce na Twój kolejny krok'}</span><h4>{query ? 'Nie znaleziono takiego wpisu' : `Uzupełnij: ${section.short.toLowerCase()}`}</h4><p>{query ? 'Zmień wyszukiwaną frazę lub wróć do sekcji.' : 'Dodaj pierwszą informację. Możesz też zebrać doświadczenia podczas wywiadu.'}</p></div>}
          <div className={classes.records}>{matching.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((group, index) => <button className={classes.record} type="button" key={group.key} disabled={disabled} onClick={() => openGroup(group)} aria-label={`Otwórz wpis: ${group.title}`}><span className={classes.recordNumber}>{String(currentPage * PAGE_SIZE + index + 1).padStart(2, '0')}</span><span className={classes.recordBody}><strong>{group.title}</strong>{group.subtitle && <span>{group.subtitle}</span>}{group.preview && <span className={classes.excerpt}>{group.preview}</span>}<span className={classes.recordMeta}>{group.fields.length} informacji{group.conflicts.size > 0 ? ' · Sprawdź warianty' : ''}</span></span><span aria-hidden="true" className={classes.arrow}>↗</span></button>)}</div>
          {matching.length > PAGE_SIZE && <Pagination current={currentPage} total={Math.ceil(matching.length / PAGE_SIZE)} disabled={disabled} onChange={(n) => { setPage(n); heading.current?.focus(); }} />}
        </>}
      </div>
    </div>
  </section>;
}

/** Native buttons retain normal tab order on paginated record and field lists. */
function Pagination({ current, total, onChange, disabled }) {
  return <nav className={classes.pagination} aria-label="Strony wpisów"><button type="button" disabled={disabled || current === 0} onClick={() => onChange(current - 1)}>← Poprzednie</button><span>{current + 1} / {total}</span><button type="button" disabled={disabled || current + 1 === total} onClick={() => onChange(current + 1)}>Następne →</button></nav>;
}
