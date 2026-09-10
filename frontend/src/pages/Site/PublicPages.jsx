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
  return <SiteLayout title="Wybierz szablon CV" intro="Porównaj układy i wybierz taki, który pasuje do tego, ile treści chcesz pokazać. W edytorze możesz później zmienić szablon bez ponownego wpisywania danych.">
    <div className={classes.toolbar}><div className={classes.field}><label htmlFor="template-tier">Pokaż szablony</label><select id="template-tier" value={tier} onChange={(event) => setTier(event.target.value)}><option value="all">Wszystkie</option><option value="free">Darmowe</option><option value="paid">W planie Pro</option></select></div><Link to="/pricing">Porównaj plany</Link></div>
    <p role="status">Pokazujemy {templates.length} {templates.length === 1 ? 'szablon' : templates.length < 5 ? 'szablony' : 'szablonów'}.</p>
    <div className={classes.grid}>{templates.map((template) => <Link className={classes.template} key={template.id} to={`/templates/${template.id}`}><TemplatePreview template={template} /><h2>{template.name}</h2><p><span className={classes.badge}>{template.tier === 'free' ? 'Darmowy' : 'Pro'}</span> · {template.layouts.includes('sidebar') ? 'Dwie kolumny' : 'Jedna kolumna'}</p><p>{template.description}</p></Link>)}</div>
  </SiteLayout>;
}

export function TemplatePage() {
  const { slug } = useParams();
  const template = TEMPLATES.find((item) => item.id === slug);
  if (!template) return <NotFoundPage />;
  return <SiteLayout title={template.name} eyebrow="SZABLON CV" intro={template.description} breadcrumbs={[{ label: 'Szablony', to: '/templates' }, { label: template.name }]}>
    <div className={classes.split}><div className={classes.detailPreview}><TemplatePreview key={template.id} template={template} /></div><section className={classes.section}>
      <h2>{template.details.heading}</h2>
      <p>{template.details.body}</p>
      <h3>Co daje ten układ?</h3>
      <ul>{template.details.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
      <p>{template.tier === 'free' ? 'Szablon jest dostępny w planie Darmowym. Możesz zacząć bez rejestracji; darmowe konto będzie potrzebne dopiero do zapisu projektu i pobrania PDF.' : 'Szablon jest dostępny w planie Pro. Podgląd i ustawienia możesz obejrzeć od razu; utworzenie CV wymaga aktywnego planu.'}</p>
      <div className={classes.actions}><Link className={classes.primary} to={getEditorPath({ start: 'new', template: template.id })}>Użyj szablonu {template.name}</Link><Link className={classes.secondary} to="/pricing">Porównaj plany</Link></div>
      <p><Link to="/help#tworzenie">Zobacz, jak zacząć</Link></p>
      <Link to="/templates">Zobacz wszystkie szablony</Link>
    </section></div>
  </SiteLayout>;
}

export function PricingPage() {
  return <SiteLayout title="Cennik" intro="Zacznij za darmo. Wybierz Pro, jeśli potrzebujesz większej liczby projektów, nielimitowanych pobrań i pomocy AI. Każdy PDF pobierzesz bez znaku wodnego.">
    <div className={classes.split}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={classes.section}><p className={classes.eyebrow}>{plan.name}</p><h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p><ul>{plan.highlights.map((item) => <li key={item}>{item}</li>)}</ul><p>{plan.period_note}</p><Link className={classes.primary} to={plan.slug === 'free' ? getEditorPath({ start: 'new' }) : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}</Link></section>)}</div>
    <section className={classes.section}><h2>Co się stanie po wykorzystaniu limitu?</h2><p>Przy kolejnej próbie zapisu, importu lub pobrania zobaczysz informację o wykorzystanym limicie. Bieżące wykorzystanie sprawdzisz na stronie konta. Jeśli chcesz pracować dalej bez tych ograniczeń, możesz przejść na Pro.</p><Link to="/help#pobieranie">Jak działa zapis i pobieranie</Link></section>
  </SiteLayout>;
}

export function HelpPage() {
  return <SiteLayout title="Jak korzystać z CV Studio?" intro="Znajdź krótką instrukcję dla etapu, na którym jesteś: tworzenia, importu, zapisu albo powrotu do CV.">
    <nav className={classes.actions} aria-label="Tematy pomocy"><a href="#tworzenie">Tworzenie CV</a><a href="#import">Import PDF</a><a href="#pobieranie">Zapis i pobieranie</a><a href="#powrot">Powrót do dokumentu</a></nav>
    <section id="tworzenie" className={classes.section}><h2>01. Utwórz nowe CV</h2><ol><li>Wybierz szablon, który pasuje do tego, ile treści chcesz pokazać.</li><li>Wpisz dane bezpośrednio na stronie A4. W edytorze zmienisz też sekcje, czcionki, kolory i odstępy.</li><li>Przejrzyj dokument od góry do dołu, a następnie pobierz PDF.</li></ol><Link className={classes.secondary} to="/templates">Wybierz szablon</Link></section>
    <section id="import" className={classes.section}><h2>02. Przenieś treść z obecnego CV</h2><p>Po założeniu konta wgraj CV w formacie PDF. CV Studio odczyta jego treść i umieści ją w wybranym szablonie. Sprawdź wynik przed pobraniem — import nie kopiuje wyglądu oryginału, a odczytane dane mogą wymagać korekty. Plan Darmowy obejmuje jeden udany import miesięcznie.</p><Link className={classes.secondary} to="/app/import">Importuj CV z PDF</Link></section>
    <section id="pobieranie" className={classes.section}><h2>03. Zapisz projekt lub pobierz PDF</h2><p>„Zapisz” przechowuje edytowalną wersję CV na Twoim koncie. „Pobierz PDF” tworzy plik z aktualnego dokumentu, ale nie zapisuje ostatnich zmian w projekcie. Obie czynności wymagają konta. Jeśli zapis się nie powiedzie, nie zamykaj karty — ponów próbę z poziomu edytora.</p><Link to="/pricing">Sprawdź limity planów</Link></section>
    <section id="powrot" className={classes.section}><h2>04. Wróć do swojego CV</h2><p>Po zalogowaniu przejdź do „Moich dokumentów” i wybierz projekt, który chcesz edytować. Możesz też zapisać adres dokumentu w zakładkach; otworzy go tylko właściciel konta. Szkic utworzony bez logowania pozostaje w tej przeglądarce i zniknie po wyczyszczeniu jej danych.</p><Link className={classes.secondary} to="/app/documents">Otwórz moje dokumenty</Link></section>
  </SiteLayout>;
}

export function PrivacyPage() {
  return <SiteLayout title="Prywatność" intro="Jak CV Studio przechowuje dokumenty i wykorzystuje dane podczas pracy.">
    <p className={classes.notice}>To informacja o działaniu aplikacji. Pełna polityka prywatności, dane administratora i kontakt w sprawach danych nie zostały jeszcze opublikowane.</p>
    <section className={classes.section}><h2>Dokumenty i konto</h2><p>Zapisane CV, zdjęcia i historia importów są przypisane do konta. Serwer sprawdza uprawnienia przed udostępnieniem dokumentu. Sam adres CV nie zapewnia dostępu osobom trzecim.</p></section>
    <section className={classes.section}><h2>Szkic w przeglądarce</h2><p>Podczas pracy bez konta szkic jest przechowywany w pamięci lokalnej tej przeglądarki. Osoba korzystająca z tego samego profilu przeglądarki może go zobaczyć. Po zalogowaniu aplikacja prosi o potwierdzenie własności szkicu przed jego przejęciem.</p></section>
    <section className={classes.section}><h2>Logowanie, wiadomości i płatności</h2><p>Przy rejestracji hasłem Resend otrzymuje adres e-mail potrzebny do dostarczenia jednorazowego linku. Logowanie Google przekazuje do serwera potwierdzony identyfikator i adres e-mail z Google Identity Services. Zakup Pro odbywa się na stronie Stripe; CV Studio zapisuje identyfikator i stan transakcji, ale nie otrzymuje pełnych danych karty.</p></section>
    <section className={classes.section}><h2>Import i funkcje AI</h2><p>Import przekazuje PDF do przetworzenia, a funkcje AI przekazują treść potrzebną do wykonania wybranej operacji dostawcy modelu. Historia importów zachowuje odczytane dane i informacje o operacji; nie przechowuje oryginalnych bajtów PDF. Wpisy historii można usuwać.</p><Link to="/help#import">Dowiedz się więcej o imporcie</Link></section>
  </SiteLayout>;
}
