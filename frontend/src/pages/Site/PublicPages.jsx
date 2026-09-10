/** Public information pages reuse the template registry and canonical plan copy. */
import { useState } from 'react';
import { FiCheck, FiFileText, FiUpload, FiDownload, FiFolder, FiArrowRight, FiMessageSquare } from 'react-icons/fi';
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
  return <SiteLayout title="Cennik" eyebrow="TWÓJ KOLEJNY KROK" intro="Stwórz CV samodzielnie za darmo. Z Pro zbierz doświadczenia w wywiadzie AI i przygotuj kolejne wersje pod wybrane oferty."
    heroAside={<HeroNote icon={<FiFileText />} label="W KAŻDYM PLANIE" title="Twoje CV. Bez znaku wodnego."><p>Gotowy PDF należy do Ciebie. Wybierz plan dopasowany do tego, jak chcesz pracować.</p></HeroNote>}>
    <div className={classes.planGrid}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={`${classes.plan} ${plan.slug === 'pro' ? classes.planFeatured : ''}`}>
      <div className={classes.planLabel}><span>{plan.name}</span><span>{plan.slug === 'free' ? 'NA DOBRY POCZĄTEK' : 'WIĘCEJ MOŻLIWOŚCI'}</span></div>
      <h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p>
      <ul className={classes.checklist}>{plan.highlights.map((item) => <li key={item}><FiCheck aria-hidden="true" /><span>{item}</span></li>)}</ul>
      <div className={classes.planBottom}><p>{plan.period_note}</p><Link className={plan.slug === 'pro' ? classes.secondary : classes.primary} to={plan.slug === 'free' ? getEditorPath({ start: 'new' }) : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}<FiArrowRight aria-hidden="true" /></Link></div>
    </section>)}</div>
    <section id="wywiad" tabIndex={-1} className={classes.supportPanel}><SiteMarker><FiMessageSquare /></SiteMarker><div><p className={classes.eyebrow}>WYWIAD · W PLANIE PRO</p><h2>Masz doświadczenie. Znajdź słowa, które je pokażą.</h2><p>AI pyta o Twoje działania, narzędzia i rezultaty. Możesz zacząć bez CV, rozwinąć obecne albo uzupełnić informacje ważne dla konkretnej oferty. Sprawdzasz fakty i proponowaną treść, zanim zapiszesz nowe CV.</p><p>Wywiad korzysta z tych samych 200 kredytów co pozostałe funkcje AI. Pytania AI, przygotowanie treści i jej kontrola zużywają kredyty; koszt zależy od rozmowy i generowania. Poprawianie i usuwanie profilu pozostaje bezpłatne także po wygaśnięciu Pro.</p><Link to="/help#wywiad">Jak działa wywiad i rozliczanie kredytów <FiArrowRight aria-hidden="true" /></Link></div></section>
    <section className={classes.supportPanel}><SiteMarker><FiFolder /></SiteMarker><div><h2>Co się stanie po wykorzystaniu limitu?</h2><p>Przy kolejnej próbie zapisu, importu, pobrania lub operacji AI zobaczysz informację o wykorzystanym limicie. Pro znosi limity projektów, importów i pobrań PDF, ale AI nadal korzysta z puli kredytów. Bieżące wykorzystanie sprawdzisz na stronie konta. Zapisane odpowiedzi wywiadu pozostają dostępne, gdy zabraknie kredytów.</p><Link to="/app/account">Sprawdź plan i wykorzystanie</Link></div></section>
  </SiteLayout>;
}

/** Native anchors keep help topics bookmarkable and keyboard reachable without tab state. */
export function HelpPage() {
  return <SiteLayout title="Jak korzystać z CV Studio?" eyebrow="POMOC KROK PO KROKU" intro="Wybierz temat: tworzenie CV, wywiad AI, dopasowanie do oferty, import lub zapis. Możesz wrócić do każdej instrukcji w trakcie pracy."
    heroAside={<HeroNote icon={<FiFileText />} label="PIERWSZY RAZ TUTAJ?" title="Zacznij od szablonu."><p>Treść wpisujesz wprost na stronie A4. Wygląd dopasujesz podczas edycji.</p><Link className={classes.secondary} to="/templates">Zobacz szablony<FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <div className={classes.guideLayout}>
    <nav className={classes.guideNav} aria-label="Tematy pomocy"><p className={classes.eyebrow}>NA TEJ STRONIE</p>{[['tworzenie', 'Tworzenie CV'], ['wywiad', 'Wywiad AI · Pro'], ['dopasowanie', 'CV pod ofertę · Pro'], ['profil', 'Profil i zapisane rozmowy'], ['import', 'Import PDF'], ['pobieranie', 'Zapis i pobieranie'], ['powrot', 'Powrót do dokumentu']].map(([id, label], index) => <a key={id} href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{label}<FiArrowRight aria-hidden="true" /></a>)}</nav>
    <div className={classes.guideContent}>
    <section id="tworzenie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>TEMAT 01</span></div><h2>Utwórz nowe CV</h2><ol><li>Wybierz szablon, który pasuje do tego, ile treści chcesz pokazać.</li><li>Wpisz dane bezpośrednio na stronie A4. W edytorze zmienisz też sekcje, czcionki, kolory i odstępy.</li><li>Przejrzyj dokument od góry do dołu, a następnie pobierz PDF.</li></ol><Link className={classes.secondary} to="/templates">Wybierz szablon<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="wywiad" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiMessageSquare /></SiteMarker><span className={classes.eyebrow}>TEMAT 02 · PRO</span></div>
      <h2>Wywiad: zamień doświadczenie w treść CV</h2>
      <p>Nie wiesz, jak opisać swoją pracę? Wywiad AI pomaga zebrać konkretne działania, narzędzia, skalę odpowiedzialności i rezultaty. To rozmowa o Twojej karierze, a nie próbna rozmowa rekrutacyjna.</p>
      <ol>
        <li>Otwórz „CV z pomocą wywiadu”. Zacznij od podstawowych danych albo wskaż własne CV lub wcześniejszy import. Znane informacje możesz poprawić przed rozmową.</li>
        <li>Odpowiadaj po polsku, po jednym pytaniu. Przy tworzeniu lub uzupełnianiu CV pierwsza runda obejmuje do 8 pytań, łącznie z doprecyzowaniami. Możesz ją zakończyć wcześniej lub dobrowolnie pogłębić o maksymalnie 5 kolejnych pytań.</li>
        <li>Przejrzyj i zatwierdź zebrane informacje. Dopiero wtedy trafią do profilu zawodowego, który wykorzystasz przy kolejnych CV.</li>
        <li>Wybierz język treści CV i szablon, sprawdź podgląd, a następnie użyj „Zapisz jako nowe CV”. Dokument otworzy się w edytorze, skąd pobierzesz PDF.</li>
      </ol>
      <div className={classes.guideFaq}>
        <details><summary>Nie mam doświadczenia zawodowego. Od czego zacząć?</summary><p>Opisz projekty, studia, praktyki lub wolontariat. Wpisz, co zrobiłeś samodzielnie, jakich narzędzi użyłeś i jaki był efekt. Nie musisz mieć wcześniejszego CV ani podawać nieznanych Ci liczb.</p></details>
        <details><summary>Co zrobić, gdy nie znam odpowiedzi albo AI coś źle zrozumiało?</summary><p>„Nie mam takiego doświadczenia”, „Nie pamiętam” i „Pomiń” znaczą co innego. Wybierz odpowiedź zgodną z sytuacją. Jeśli propozycja treści wymaga wyjaśnienia, wywiad pozwoli ją doprecyzować przed końcowym podglądem. Możesz też pominąć doprecyzowanie i zachować wersję opartą na potwierdzonych informacjach.</p></details>
        <details><summary>Jak wywiad zużywa kredyty AI?</summary><p>Wywiad wymaga aktywnego Pro. Pytania generowane przez AI, przygotowanie treści CV i osobna kontrola tej treści korzystają ze wspólnej puli kredytów. Nie ma stałej ceny całej rozmowy ani przelicznika „jeden kredyt = jedno pytanie”. Kolejne generowanie po zmianach może zużyć nowe kredyty, a wykonana operacja AI może kosztować także wtedy, gdy jej wynik wymaga poprawy.</p><p>Zapis odpowiedzi, zatwierdzanie faktów i ręczne zarządzanie profilem nie zużywają kredytów AI. Odpowiedź na już zapisane pytanie doprecyzowujące również nie wywołuje AI; późniejsze ponowne generowanie korzysta z kredytów. <Link to="/app/account">Sprawdź wykorzystanie planu</Link> lub <Link to="/pricing#wywiad">przeczytaj o Pro w cenniku</Link>.</p></details>
        <details><summary>Czy mogę przerwać rozmowę i wrócić później?</summary><p>Tak. Zapisane odpowiedzi pozostają na koncie również przy błędzie sieci lub braku kredytów. Rozmowę wznowisz w „Profilu zawodowym”, w widoku „Zapisane wywiady”. Przed zamknięciem karty zapisz bieżącą odpowiedź — niewysłany tekst nie przetrwa ponownego uruchomienia przeglądarki. Dalsze operacje AI wymagają aktywnego Pro i dostępnych kredytów.</p></details>
      </div>
      <Link className={classes.secondary} to="/app/interview">Przejdź do wywiadu · Pro <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="dopasowanie" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>TEMAT 03 · PRO</span></div>
      <h2>Dopasuj CV do konkretnej oferty</h2>
      <ol><li>Otwórz swoje CV i asystenta AI. Wybierz „Dopasuj do oferty”, dodaj ogłoszenie, a następnie „Dopasuj z wywiadem — nowe CV”.</li><li>AI zestawi wymagania oferty z CV i zatwierdzonym profilem. Krótka runda do 5 pytań, łącznie z doprecyzowaniami, pomoże uzupełnić istotne informacje. Możesz też wpisać dodatkowe fakty ręcznie lub przejść do generowania bez tej rundy.</li><li>Zatwierdź informacje i sprawdź treść, proponowane zmiany oraz wymagania, których nadal nie udało się potwierdzić. W razie niejasności możesz odpowiedzieć na pytania doprecyzowujące.</li><li>Zapisz wynik jako nowe CV. Źródłowy dokument zachowa swoją treść; nową wersję dopracujesz w edytorze.</li></ol>
      <p>Oferta pomaga wybrać, co warto pokazać. Nie potwierdza Twoich umiejętności. Sprawdź proponowane opisy przed wysłaniem CV — dopasowanie nie gwarantuje zaproszenia na rozmowę.</p>
      <Link className={classes.secondary} to="/app/documents">Wybierz CV do dopasowania <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="profil" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>TEMAT 04</span></div>
      <h2>Twój profil zawodowy i zapisane rozmowy</h2>
      <p>Profil to wspólna baza zatwierdzonych informacji do kolejnych CV. Wybierz sekcję i wpis, edytuj potrzebne pole, użyj „Zastosuj zmianę”, a następnie „Zapisz profil”. Zmiany nie przepisują automatycznie wcześniej zapisanych dokumentów.</p>
      <p>Przeglądanie, poprawianie i usuwanie profilu pozostaje dostępne bez kredytów, również po wygaśnięciu Pro. W widoku „Zapisane wywiady” znajdziesz rozmowy do wznowienia. Usunięcie rozmowy pozostawia zatwierdzone informacje w profilu i gotowe CV; wyczyszczenie profilu nie usuwa historii rozmów ani dokumentów.</p>
      <Link className={classes.secondary} to="/app/career-profile">Otwórz profil zawodowy <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="import" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiUpload /></SiteMarker><span className={classes.eyebrow}>TEMAT 05</span></div><h2>Przenieś treść z obecnego CV</h2><p>Po założeniu konta wgraj CV w formacie PDF. CV Studio odczyta jego treść i umieści ją w wybranym szablonie. Sprawdź wynik przed pobraniem — import nie kopiuje wyglądu oryginału, a odczytane dane mogą wymagać korekty. Plan Darmowy obejmuje jeden udany import miesięcznie.</p><p>W Pro po wypełnieniu CV danymi importu możesz wybrać „Uzupełnij CV przez wywiad”, aby rozwinąć opisy o dodatkowe doświadczenia. <Link to="/help#wywiad">Zobacz instrukcję wywiadu</Link>.</p><Link className={classes.secondary} to="/app/import">Importuj CV z PDF<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="pobieranie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiDownload /></SiteMarker><span className={classes.eyebrow}>TEMAT 06</span></div><h2>Zapisz projekt lub pobierz PDF</h2><p>„Zapisz” przechowuje edytowalną wersję CV na Twoim koncie. „Pobierz PDF” tworzy plik z aktualnego dokumentu, ale nie zapisuje ostatnich zmian w projekcie. Obie czynności wymagają konta. Jeśli zapis się nie powiedzie, nie zamykaj karty — ponów próbę z poziomu edytora.</p><Link className={classes.secondary} to="/pricing">Sprawdź limity planów<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="powrot" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>TEMAT 07</span></div><h2>Wróć do swojego CV</h2><p>Po zalogowaniu przejdź do „Moich dokumentów” i wybierz projekt, który chcesz edytować. Możesz też zapisać adres dokumentu w zakładkach; otworzy go tylko właściciel konta. Szkic utworzony bez logowania pozostaje w tej przeglądarce i zniknie po wyczyszczeniu jej danych.</p><Link className={classes.secondary} to="/app/documents">Otwórz moje dokumenty<FiArrowRight aria-hidden="true" /></Link></section>
    </div></div>
  </SiteLayout>;
}
