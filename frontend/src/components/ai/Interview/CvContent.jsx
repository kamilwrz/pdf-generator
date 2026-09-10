import { useRef, useState } from 'react';
import classes from './InterviewPreview.module.css';

const text = (value) => typeof value === 'string' && value.trim() ? value : null;

/** Page long lists locally; every item remains in the unmodified renderer data. */
function ContentItems({ values = [] }) {
  const [page, setPage] = useState(0);
  const list = useRef(null);
  function move(next) { setPage(next); list.current?.focus(); }
  return <div><ul ref={list} tabIndex={-1}>{values.slice(page * 6, (page + 1) * 6).map((value, index) => <li key={`${page}-${index}`}>{typeof value === 'string' ? value : <>
      <strong>{value.title || value.category || value.name}</strong>
      {[value.subtitle, value.date, value.description, value.body].filter(text).map((line, i) => <p key={i}>{line}</p>)}
      {(value.bullets || value.items) && <ContentItems values={value.bullets || value.items} />}
    </>}</li>)}</ul>{values.length > 6 && <nav className={classes.pagination} aria-label="Punkty wpisu"><button type="button" disabled={page === 0} onClick={() => move(page - 1)}>Wcześniejsze punkty</button><span>{page * 6 + 1}–{Math.min((page + 1) * 6, values.length)} z {values.length}</span><button type="button" disabled={(page + 1) * 6 >= values.length} onClick={() => move(page + 1)}>Dalsze punkty</button></nav>}</div>;
}

/** Semantic record review uses the same normalized fields as the CV renderer. */
export default function CvContent({ data }) {
  const items = (values) => <ContentItems values={values} />;
  return <article aria-label="Treść wybranego wpisu CV">
    {data.name && <h3>{data.name}</h3>}{data.title && <p>{data.title}</p>}
    <p>{[data.email, data.phone, data.address, data.linkedin, data.github, data.website].filter(text).join(' · ')}</p>
    {data.summary && <section><h3>Podsumowanie</h3><p>{data.summary}</p></section>}
    {data.experience?.length > 0 && <section><h3>Doświadczenie</h3>{data.experience.map((entry, i) => <div key={i}><strong>{entry.title} · {entry.company}</strong><p>{[entry.city, entry.period].filter(text).join(' · ')}</p>{items(entry.bullets)}</div>)}</section>}
    {data.education?.length > 0 && <section><h3>Edukacja</h3>{data.education.map((entry, i) => <div key={i}><strong>{entry.degree} · {entry.school}</strong><p>{[entry.city, entry.period].filter(text).join(' · ')}</p>{entry.bullets?.length ? items(entry.bullets) : <p>{entry.description}</p>}</div>)}</section>}
    {data.skills?.length > 0 && <section><h3>Umiejętności</h3>{items(data.skills)}</section>}
    {data.languages?.length > 0 && <section><h3>Języki</h3><ul>{data.languages.map((entry, i) => <li key={i}>{entry.name} · {entry.level}</li>)}</ul></section>}
    {data.custom_sections?.map((section, i) => <section key={i}><h3>{section.title}</h3>{items(section.items)}</section>)}
  </article>;
}
