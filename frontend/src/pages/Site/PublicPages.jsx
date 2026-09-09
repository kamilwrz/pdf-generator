/** Public information pages reuse the template registry and canonical plan copy. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import { TEMPLATES } from '../../templates';
import { PLAN_PRESENTATION } from '../../utils/planPresentation';
import { getAccessToken, getEditorPath } from '../../utils/authSession';
import { NotFoundPage } from '../../components/common/ErrorBoundary/ErrorBoundary';

/** Keep the document footprint and navigation available when a preview fails. */
export function TemplatePreview({ template }) {
  const [failed, setFailed] = useState(false);
  return <div className={classes.preview}>{failed ? <span>Podgląd niedostępny</span> : <img src={`/template-mockups/${template.id}.png`} alt={`Przykładowe CV — ${template.name}`} loading="lazy" onError={() => setFailed(true)} />}</div>;
}

export function TemplatesPage() {
  const [tier, setTier] = useState('all');
  const templates = TEMPLATES.filter((template) => tier === 'all' || template.tier === tier);
  return <SiteLayout title="Szablony CV" intro="Wybierz układ, w którym Twoje doświadczenie będzie czytelne. Treść możesz później przenieść do innego szablonu.">
    <div className={classes.toolbar}><div className={classes.field}><label htmlFor="template-tier">Dostępność szablonów</label><select id="template-tier" value={tier} onChange={(event) => setTier(event.target.value)}><option value="all">Wszystkie szablony</option><option value="free">Darmowe</option><option value="paid">Pro</option></select></div><Link to="/pricing">Porównaj plany</Link></div>
    <p role="status">Liczba szablonów: {templates.length}</p>
    <div className={classes.grid}>{templates.map((template) => <Link className={classes.template} key={template.id} to={`/templates/${template.id}`}><TemplatePreview template={template} /><h2>{template.name}</h2><p><span className={classes.badge}>{template.tier === 'free' ? 'Darmowy' : 'Pro'}</span> · {template.layouts.includes('sidebar') ? 'Dwie kolumny' : 'Jedna kolumna'}</p></Link>)}</div>
  </SiteLayout>;
}

export function TemplatePage() {
  const { slug } = useParams();
  const template = TEMPLATES.find((item) => item.id === slug);
  if (!template) return <NotFoundPage />;
  return <SiteLayout title={template.name} eyebrow="SZABLON CV" intro={template.description} breadcrumbs={[{ label: 'Szablony', to: '/templates' }, { label: template.name }]}>
    <div className={classes.split}><div className={classes.detailPreview}><TemplatePreview key={template.id} template={template} /></div><section className={classes.section}>
      <h2>Twój tekst, gotowy układ.</h2>
      <p>{template.layouts.includes('sidebar') ? 'Dwie kolumny oddzielają dane kontaktowe i dodatkowe informacje od głównej historii zawodowej.' : 'Jedna kolumna prowadzi od danych kontaktowych przez kolejne sekcje doświadczenia.'}</p>
      <p>{template.tier === 'free' ? 'Ten szablon jest darmowy. Zaczniesz bez konta; zapis i pobranie PDF wymagają darmowego konta.' : 'Ten szablon wymaga aktywnego Pro. Możesz obejrzeć konfigurację przed wyborem planu; utworzenie CV jest dostępne po potwierdzeniu uprawnień.'}</p>
      <div className={classes.actions}><Link className={classes.primary} to={getEditorPath({ start: 'new', template: template.id })}>Stwórz CV z tym szablonem</Link><Link className={classes.secondary} to="/pricing">Porównaj plany</Link></div>
      <p><Link to="/help#tworzenie">Jak przygotować pierwsze CV</Link></p>
      <Link to="/templates">Zobacz wszystkie szablony</Link>
    </section></div>
  </SiteLayout>;
}

export function PricingPage() {
  return <SiteLayout title="Cennik" intro="Wybierz zakres pracy nad CV. Oba plany pozwalają pobrać PDF bez znaku wodnego.">
    <div className={classes.split}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={classes.section}><p className={classes.eyebrow}>{plan.name}</p><h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p><ul>{plan.highlights.map((item) => <li key={item}>{item}</li>)}</ul><p>{plan.period_note}</p><Link className={classes.primary} to={plan.slug === 'free' ? getEditorPath({ start: 'new' }) : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}</Link></section>)}</div>
    <section className={classes.section}><h2>Co dzieje się po wykorzystaniu limitu?</h2><p>Aplikacja pokazuje informację przy operacji, której dotyczy limit. Aktualne wykorzystanie sprawdzisz na stronie konta. Zmiana planu wymaga potwierdzenia przez serwer; dostępność płatności zależy od konfiguracji usługi.</p><Link to="/help#pobieranie">Jak zapisywać i pobierać CV</Link></section>
  </SiteLayout>;
}

export function HelpPage() {
  return <SiteLayout title="Jak możemy pomóc?" intro="Od pierwszego szablonu do gotowego pliku. Wybierz etap, nad którym pracujesz.">
    <nav className={classes.actions} aria-label="Tematy pomocy"><a href="#tworzenie">Tworzenie CV</a><a href="#import">Import PDF</a><a href="#pobieranie">Zapis i pobieranie</a><a href="#powrot">Powrót do dokumentu</a></nav>
    <section id="tworzenie" className={classes.section}><h2>01. Utwórz CV</h2><ol><li>Wybierz szablon i rozpocznij edycję.</li><li>Wpisz swoje dane bezpośrednio na stronie A4. Sekcje i wygląd dostosujesz w edytorze.</li><li>Sprawdź zawartość i układ przed pobraniem pliku.</li></ol><Link className={classes.secondary} to="/templates">Wybierz szablon</Link></section>
    <section id="import" className={classes.section}><h2>02. Zaimportuj istniejące CV</h2><p>Import wymaga konta. Wgraj PDF, sprawdź odczytane dane i wybierz szablon. Import przenosi treść do nowego układu — wynik może różnić się od wyglądu oryginału. Plan Darmowy obejmuje jeden udany import miesięcznie.</p><Link className={classes.secondary} to="/app/import">Importuj PDF</Link></section>
    <section id="pobieranie" className={classes.section}><h2>03. Zapisz projekt i pobierz PDF</h2><p>„Zapisz” przechowuje edytowalny projekt na koncie. „Pobierz PDF” tworzy plik z bieżącego widoku, ale nie zapisuje zmian w projekcie. Obie czynności wymagają konta. Gdy zapis się nie powiedzie, pozostań w edytorze i ponów operację; nie zamykaj karty z niezapisaną pracą.</p><Link to="/pricing">Sprawdź limity pobierania</Link></section>
    <section id="powrot" className={classes.section}><h2>04. Wróć do swoich dokumentów</h2><p>Po zalogowaniu otwórz „Moje dokumenty”. Wybierz CV, aby wrócić do edycji. Możesz zapisać jego adres w zakładkach; otwarcie wymaga dostępu do konta właściciela. Szkic gościnny pozostaje w tej przeglądarce i może zostać utracony po wyczyszczeniu jej danych.</p><Link className={classes.secondary} to="/app/documents">Moje dokumenty</Link></section>
  </SiteLayout>;
}

export function PrivacyPage() {
  return <SiteLayout title="Prywatność" intro="Jak CV Studio przechowuje dokumenty i wykorzystuje dane podczas pracy.">
    <p className={classes.notice}>To informacja o działaniu aplikacji. Pełna polityka prywatności, dane administratora i kontakt w sprawach danych nie zostały jeszcze opublikowane.</p>
    <section className={classes.section}><h2>Dokumenty i konto</h2><p>Zapisane CV, zdjęcia i historia importów są przypisane do konta. Serwer sprawdza uprawnienia przed udostępnieniem dokumentu. Sam adres CV nie zapewnia dostępu osobom trzecim.</p></section>
    <section className={classes.section}><h2>Szkic w przeglądarce</h2><p>Podczas pracy bez konta szkic jest przechowywany w pamięci lokalnej tej przeglądarki. Osoba korzystająca z tego samego profilu przeglądarki może go zobaczyć. Po zalogowaniu aplikacja prosi o potwierdzenie własności szkicu przed jego przejęciem.</p></section>
    <section className={classes.section}><h2>Import i funkcje AI</h2><p>Import przekazuje PDF do przetworzenia, a funkcje AI przekazują treść potrzebną do wykonania wybranej operacji dostawcy modelu. Historia importów zachowuje odczytane dane i informacje o operacji; nie przechowuje oryginalnych bajtów PDF. Wpisy historii można usuwać.</p><Link to="/help#import">Dowiedz się więcej o imporcie</Link></section>
  </SiteLayout>;
}
