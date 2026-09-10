/** Public information pages reuse the template registry and canonical plan copy. */
import { useState } from 'react';
import { FiCheck, FiFileText, FiUpload, FiDownload, FiFolder, FiArrowRight } from 'react-icons/fi';
import { HeroNote, SiteMarker } from '../../components/common/SiteLayout/SitePrimitives';
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

/** Compares canonical plan copy; emphasis does not alter billing or access checks. */
export function PricingPage() {
  return <SiteLayout title="Cennik" eyebrow="TWÓJ KOLEJNY KROK" intro="Zacznij za darmo. Wybierz Pro, jeśli potrzebujesz większej liczby projektów, nielimitowanych pobrań i pomocy AI."
    heroAside={<HeroNote icon={<FiFileText />} label="W KAŻDYM PLANIE" title="Twoje CV. Bez znaku wodnego."><p>Gotowy PDF należy do Ciebie. Wybierz plan dopasowany do tego, jak chcesz pracować.</p></HeroNote>}>
    <div className={classes.planGrid}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={`${classes.plan} ${plan.slug === 'pro' ? classes.planFeatured : ''}`}>
      <div className={classes.planLabel}><span>{plan.name}</span><span>{plan.slug === 'free' ? 'NA DOBRY POCZĄTEK' : 'WIĘCEJ MOŻLIWOŚCI'}</span></div>
      <h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p>
      <ul className={classes.checklist}>{plan.highlights.map((item) => <li key={item}><FiCheck aria-hidden="true" /><span>{item}</span></li>)}</ul>
      <div className={classes.planBottom}><p>{plan.period_note}</p><Link className={plan.slug === 'pro' ? classes.secondary : classes.primary} to={plan.slug === 'free' ? getEditorPath({ start: 'new' }) : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}<FiArrowRight aria-hidden="true" /></Link></div>
    </section>)}</div>
    <section className={classes.supportPanel}><SiteMarker><FiFolder /></SiteMarker><div><h2>Co się stanie po wykorzystaniu limitu?</h2><p>Przy kolejnej próbie zapisu, importu lub pobrania zobaczysz informację o wykorzystanym limicie. Bieżące wykorzystanie sprawdzisz na stronie konta. Jeśli chcesz pracować dalej bez tych ograniczeń, możesz przejść na Pro.</p><Link to="/help#pobieranie">Jak działa zapis i pobieranie</Link></div></section>
  </SiteLayout>;
}

/** Native anchors keep help topics bookmarkable and keyboard reachable without tab state. */
export function HelpPage() {
  return <SiteLayout title="Jak korzystać z CV Studio?" eyebrow="POMOC KROK PO KROKU" intro="Znajdź krótką instrukcję dla etapu, na którym jesteś: tworzenia, importu, zapisu albo powrotu do CV."
    heroAside={<HeroNote icon={<FiFileText />} label="PIERWSZY RAZ TUTAJ?" title="Zacznij od szablonu."><p>Treść wpisujesz wprost na stronie A4. Wygląd dopasujesz podczas edycji.</p><Link className={classes.secondary} to="/templates">Zobacz szablony<FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <div className={classes.guideLayout}>
    <nav className={classes.guideNav} aria-label="Tematy pomocy"><p className={classes.eyebrow}>NA TEJ STRONIE</p>{[['tworzenie', 'Tworzenie CV'], ['import', 'Import PDF'], ['pobieranie', 'Zapis i pobieranie'], ['powrot', 'Powrót do dokumentu']].map(([id, label], index) => <a key={id} href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{label}<FiArrowRight aria-hidden="true" /></a>)}</nav>
    <div className={classes.guideContent}>
    <section id="tworzenie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>KROK 01</span></div><h2>Utwórz nowe CV</h2><ol><li>Wybierz szablon, który pasuje do tego, ile treści chcesz pokazać.</li><li>Wpisz dane bezpośrednio na stronie A4. W edytorze zmienisz też sekcje, czcionki, kolory i odstępy.</li><li>Przejrzyj dokument od góry do dołu, a następnie pobierz PDF.</li></ol><Link className={classes.secondary} to="/templates">Wybierz szablon<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="import" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiUpload /></SiteMarker><span className={classes.eyebrow}>KROK 02</span></div><h2>Przenieś treść z obecnego CV</h2><p>Po założeniu konta wgraj CV w formacie PDF. CV Studio odczyta jego treść i umieści ją w wybranym szablonie. Sprawdź wynik przed pobraniem — import nie kopiuje wyglądu oryginału, a odczytane dane mogą wymagać korekty. Plan Darmowy obejmuje jeden udany import miesięcznie.</p><Link className={classes.secondary} to="/app/import">Importuj CV z PDF<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="pobieranie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiDownload /></SiteMarker><span className={classes.eyebrow}>KROK 03</span></div><h2>Zapisz projekt lub pobierz PDF</h2><p>„Zapisz” przechowuje edytowalną wersję CV na Twoim koncie. „Pobierz PDF” tworzy plik z aktualnego dokumentu, ale nie zapisuje ostatnich zmian w projekcie. Obie czynności wymagają konta. Jeśli zapis się nie powiedzie, nie zamykaj karty — ponów próbę z poziomu edytora.</p><Link className={classes.secondary} to="/pricing">Sprawdź limity planów<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="powrot" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>KROK 04</span></div><h2>Wróć do swojego CV</h2><p>Po zalogowaniu przejdź do „Moich dokumentów” i wybierz projekt, który chcesz edytować. Możesz też zapisać adres dokumentu w zakładkach; otworzy go tylko właściciel konta. Szkic utworzony bez logowania pozostaje w tej przeglądarce i zniknie po wyczyszczeniu jej danych.</p><Link className={classes.secondary} to="/app/documents">Otwórz moje dokumenty<FiArrowRight aria-hidden="true" /></Link></section>
    </div></div>
  </SiteLayout>;
}
