/** User review owns wording, role context and exclusions before persistence. */
import { useId, useRef } from 'react';
import classes from './Interview.module.css';
import { interviewFields as fields, factLabel } from '../../../utils/interviewPresentation';

export default function FactEditor({ facts, onChange, disabled = false }) {
  const id = useId();
  const addRef = useRef(null);
  function update(index, patch) { onChange(facts.map((fact, i) => i === index ? { ...fact, ...patch } : fact)); }
  return <fieldset disabled={disabled}>
    <legend>Informacje do wykorzystania</legend>
    <p className={classes.hint}>Sprawdź treść i własny udział w osiągnięciach. Usuń informacje, których nie chcesz używać. Zmiany nie modyfikują wcześniej zapisanych CV.</p>
    {!facts.length && <p>Profil jest pusty. Dodaj imię i nazwisko oraz informacje o doświadczeniu, projektach lub edukacji.</p>}
    {facts.map((fact, index) => <details className={classes.fact} key={fact.id}>
      <summary>{factLabel(fact)}: {fact.text ? fact.text.slice(0, 100) : 'Uzupełnij'}</summary>
      <label htmlFor={`${id}-${index}-text`}>Treść<textarea id={`${id}-${index}-text`} maxLength={4000} rows={3} value={fact.text} onChange={(event) => update(index, { text: event.target.value })} /></label>
      <label htmlFor={`${id}-${index}-context`}>Rola lub projekt<textarea id={`${id}-${index}-context`} maxLength={500} rows={2} value={fact.context?.startsWith('/') ? '' : fact.context} placeholder="Np. projekt raportowania w firmie ABC" onChange={(event) => update(index, { context: event.target.value })} /></label>
      <label htmlFor={`${id}-${index}-kind`}>Rodzaj informacji<select id={`${id}-${index}-kind`} value={fact.kind} onChange={(event) => update(index, { kind: event.target.value })}><option value="fact">Potwierdzony fakt</option><option value="gap">Nie mam tego doświadczenia</option><option value="framing">Sformułowanie do zachowania dosłownie</option></select></label>
      {(!fact.path || fields[fact.path]) && <label htmlFor={`${id}-${index}-field`}>Przeznaczenie<select id={`${id}-${index}-field`} value={fact.path || ''} onChange={(event) => update(index, { path: event.target.value })}><option value="">Informacja do rozwinięcia w CV</option>{Object.entries(fields).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {fact.path && !fields[fact.path] && <button type="button" onClick={() => update(index, { path: '' })}>Zachowaj jako dodatkową informację</button>}
      <button className={classes.danger} type="button" onClick={() => { onChange(facts.filter((_, i) => i !== index)); addRef.current?.focus(); }}>Usuń informację</button>
    </details>)}
    <button ref={addRef} type="button" disabled={facts.length >= 500} onClick={() => onChange([...facts, { id: crypto.randomUUID(), text: '', context: '', kind: 'fact', path: '', source: 'manual' }])}>Dodaj informację</button>
  </fieldset>;
}
