/** Semantic content review uses the same normalized fields as the CV renderer. */
export default function CvContent({ data }) {
  const text = (value) => typeof value === 'string' && value.trim() ? value : null;
  function items(values) {
    return <ul>{(values || []).map((value, index) => <li key={index}>{typeof value === 'string' ? value : <>
      <strong>{value.title || value.category || value.name}</strong>
      {[value.subtitle, value.date, value.description, value.body].filter(text).map((line, i) => <p key={i}>{line}</p>)}
      {(value.bullets || value.items) && items(value.bullets || value.items)}
    </>}</li>)}</ul>;
  }
  return <article aria-label="Cała treść nowego CV">
    <h3>{data.name}</h3><p>{data.title}</p>
    <p>{[data.email, data.phone, data.address, data.linkedin, data.github, data.website].filter(text).join(' · ')}</p>
    {data.summary && <section><h3>Podsumowanie</h3><p>{data.summary}</p></section>}
    {data.experience?.length > 0 && <section><h3>Doświadczenie</h3>{data.experience.map((entry, i) => <div key={i}><strong>{entry.title} · {entry.company}</strong><p>{[entry.city, entry.period].filter(text).join(' · ')}</p>{items(entry.bullets)}</div>)}</section>}
    {data.education?.length > 0 && <section><h3>Edukacja</h3>{data.education.map((entry, i) => <div key={i}><strong>{entry.degree} · {entry.school}</strong><p>{[entry.city, entry.period].filter(text).join(' · ')}</p>{entry.bullets?.length ? items(entry.bullets) : <p>{entry.description}</p>}</div>)}</section>}
    {data.skills?.length > 0 && <section><h3>Umiejętności</h3>{items(data.skills)}</section>}
    {data.languages?.length > 0 && <section><h3>Języki</h3><ul>{data.languages.map((entry, i) => <li key={i}>{entry.name} · {entry.level}</li>)}</ul></section>}
    {data.custom_sections?.map((section, i) => <section key={i}><h3>{section.title}</h3>{items(section.items)}</section>)}
  </article>;
}
