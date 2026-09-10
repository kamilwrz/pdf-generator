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
  return <div className={classes.preview}>{failed ? <span>Nie udało się wczytać podglądu</span> : <img src={`/template-mockups/${template.id}.png`} alt={`Przykładowe CV — ${template.name}`} loading="lazy" onError={() => setFailed(true)} />}</div>;
}

export function TemplatesPage() {
  const [tier, setTier] = useState('all');
  const templates = TEMPLATES.filter((template) => tier === 'all' || template.tier === tier);
  return <SiteLayout title="Znajdź układ dla swojego CV" intro="Zobacz, jak każdy szablon porządkuje treść. Jeśli później zmienisz zdanie, wybierzesz inny układ bez ponownego wpisywania danych.">
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
      <h3>Jak ten układ porządkuje treść?</h3>
      <ul>{template.details.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
      <p>{template.tier === 'free' ? 'Ten szablon jest dostępny w planie Darmowym. Zaczniesz bez rejestracji, a konto będzie potrzebne dopiero do zapisania projektu lub pobrania PDF.' : 'Ten szablon jest dostępny w Pro. Podgląd i ustawienia obejrzysz od razu, ale do utworzenia CV potrzebujesz aktywnego planu.'}</p>
      <div className={classes.actions}><Link className={classes.primary} to={getEditorPath({ start: 'new', template: template.id })}>Użyj szablonu {template.name}</Link><Link className={classes.secondary} to="/pricing">Porównaj plany</Link></div>
      <p><Link to="/help#tworzenie">Zobacz, jak zacząć</Link></p>
      <Link to="/templates">Zobacz wszystkie szablony</Link>
    </section></div>
  </SiteLayout>;
}

/** Compares canonical plan copy; emphasis does not alter billing or access checks. */
export function PricingPage() {
  return <SiteLayout title="Wybierz plan dla siebie" eyebrow="CENNIK" intro="Plan Darmowy wystarczy do samodzielnego przygotowania CV. Pro dodaje wywiad AI i ułatwia tworzenie osobnych wersji pod konkretne oferty."
    heroAside={<HeroNote icon={<FiFileText />} label="W KAŻDYM PLANIE" title="PDF bez znaku wodnego."><p>Wybierz plan według tego, ilu dokumentów potrzebujesz i czy chcesz korzystać z AI.</p></HeroNote>}>
    <div className={classes.planGrid}>{Object.values(PLAN_PRESENTATION).map((plan) => <section key={plan.slug} className={`${classes.plan} ${plan.slug === 'pro' ? classes.planFeatured : ''}`}>
      <div className={classes.planLabel}><span>{plan.name}</span><span>{plan.slug === 'free' ? 'NA POCZĄTEK' : 'DO PRACY Z AI'}</span></div>
      <h2>{plan.blurb}</h2><p className={classes.price}>{plan.price_label}</p>
      <ul className={classes.checklist}>{plan.highlights.map((item) => <li key={item}><FiCheck aria-hidden="true" /><span>{item}</span></li>)}</ul>
      <div className={classes.planBottom}><p>{plan.period_note}</p><Link className={plan.slug === 'pro' ? classes.secondary : classes.primary} to={plan.slug === 'free' ? getEditorPath({ start: 'new' }) : getAccessToken() ? '/app/account' : '/register?plan=pro'}>{plan.cta}<FiArrowRight aria-hidden="true" /></Link></div>
    </section>)}</div>
    <section id="wywiad" tabIndex={-1} className={classes.supportPanel}><SiteMarker><FiMessageSquare /></SiteMarker><div><p className={classes.eyebrow}>WYWIAD · W PLANIE PRO</p><h2>Opowiedz o swojej pracy, a AI pomoże ułożyć z tego CV.</h2><p>Wywiad pyta o działania, narzędzia i wyniki. Możesz zacząć bez CV, rozwinąć obecny dokument albo zebrać informacje pod konkretną ofertę. Przed zapisem sprawdzasz fakty i gotowy tekst.</p><p>Wywiad korzysta ze wspólnej puli 200 kredytów na wszystkie funkcje AI. Kredyty zużywają pytania, przygotowanie treści i jej kontrola, a koszt zależy od przebiegu rozmowy i generowania. Profil możesz poprawiać i usuwać bezpłatnie także po wygaśnięciu Pro.</p><Link to="/help#wywiad">Jak działa wywiad i rozliczanie kredytów <FiArrowRight aria-hidden="true" /></Link></div></section>
    <section className={classes.supportPanel}><SiteMarker><FiFolder /></SiteMarker><div><h2>Co się stanie po wykorzystaniu limitu?</h2><p>Przy kolejnej próbie zapisu, importu, pobrania lub operacji AI zobaczysz informację o wykorzystanym limicie. Pro znosi limity projektów, importów i pobrań PDF, ale AI nadal korzysta z puli kredytów. Bieżące wykorzystanie sprawdzisz na stronie konta. Zapisane odpowiedzi wywiadu pozostają dostępne, gdy zabraknie kredytów.</p><Link to="/app/account">Sprawdź plan i wykorzystanie</Link></div></section>
  </SiteLayout>;
}

/** Native anchors keep help topics bookmarkable and keyboard reachable without tab state. */
export function HelpPage() {
  return <SiteLayout title="Pomoc w tworzeniu CV" eyebrow="INSTRUKCJE" intro="Wybierz temat i przejdź od razu do potrzebnej instrukcji. Możesz tu wrócić w dowolnym momencie pracy."
    heroAside={<HeroNote icon={<FiFileText />} label="PIERWSZE CV W STUDIO?" title="Zacznij od szablonu."><p>Treść wpisujesz bezpośrednio na stronie A4, a wygląd zmieniasz podczas edycji.</p><Link className={classes.secondary} to="/templates">Zobacz szablony<FiArrowRight aria-hidden="true" /></Link></HeroNote>}>
    <div className={classes.guideLayout}>
    <nav className={classes.guideNav} aria-label="Tematy pomocy"><p className={classes.eyebrow}>NA TEJ STRONIE</p>{[['tworzenie', 'Tworzenie CV'], ['wywiad', 'Wywiad AI · Pro'], ['dopasowanie', 'CV pod ofertę · Pro'], ['profil', 'Profil i zapisane rozmowy'], ['import', 'Import PDF'], ['pobieranie', 'Zapis i pobieranie'], ['powrot', 'Powrót do dokumentu']].map(([id, label], index) => <a key={id} href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{label}<FiArrowRight aria-hidden="true" /></a>)}</nav>
    <div className={classes.guideContent}>
    <section id="tworzenie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>TEMAT 01</span></div><h2>Utwórz nowe CV</h2><ol><li>Wybierz szablon, który pasuje do tego, ile treści chcesz pokazać.</li><li>Wpisz dane bezpośrednio na stronie A4. W edytorze zmienisz też sekcje, czcionki, kolory i odstępy.</li><li>Przejrzyj dokument od góry do dołu, a następnie pobierz PDF.</li></ol><Link className={classes.secondary} to="/templates">Wybierz szablon<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="wywiad" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiMessageSquare /></SiteMarker><span className={classes.eyebrow}>TEMAT 02 · PRO</span></div>
      <h2>Wywiad: zamień doświadczenie w treść CV</h2>
      <p>Jeśli trudno Ci opisać swoją pracę, wywiad AI pomoże zebrać działania, używane narzędzia, zakres odpowiedzialności i wyniki. Pytania dotyczą Twojej kariery, nie przygotowania do rozmowy rekrutacyjnej.</p>
      <ol>
        <li>Otwórz „CV z pomocą wywiadu”. Zacznij od podstawowych danych albo wskaż własne CV lub wcześniejszy import. Znane informacje możesz poprawić przed rozmową.</li>
        <li>Odpowiadaj po polsku, po jednym pytaniu. Przy tworzeniu lub uzupełnianiu CV pierwsza runda obejmuje do 8 pytań, łącznie z doprecyzowaniami. Możesz ją zakończyć wcześniej lub dobrowolnie pogłębić o maksymalnie 5 kolejnych pytań.</li>
        <li>W razie potrzeby popraw zebrane informacje, a następnie przejdź do rozmowy lub przygotowania CV. Przejście dalej zapisuje zmiany bez osobnego zatwierdzania. W trybie „Mój profil zawodowy” trafią do profilu konta. Dla osobnego CV pozostaną tylko w tym wywiadzie.</li>
        <li>Wybierz język treści CV i szablon, sprawdź podgląd, a następnie użyj „Zapisz jako nowe CV”. Dokument otworzy się w edytorze, skąd pobierzesz PDF.</li>
      </ol>
      <div className={classes.guideFaq}>
        <details><summary>Czy mogę pracować nad CV innej osoby?</summary><p>Tak. Wybierz jej dokument lub import jako źródło. Wywiad domyślnie użyje tylko tego CV i odpowiedzi z bieżącej rozmowy, bez danych Twojego profilu. Pozostaw opcję „To moje CV — dołącz mój profil zawodowy” niezaznaczoną. Aby zacząć bez dokumentu, wybierz „Nowe CV — bez profilu konta”. Starsze rozmowy sprzed rozdzielenia źródeł zachowują odpowiedzi, ale wymagają rozpoczęcia nowego wywiadu.</p></details>
        <details><summary>Nie mam doświadczenia zawodowego. Od czego zacząć?</summary><p>Opisz projekty, studia, praktyki lub wolontariat. Wpisz, co zrobiłeś samodzielnie, jakich narzędzi użyłeś i jaki był efekt. Nie musisz mieć wcześniejszego CV ani podawać nieznanych Ci liczb.</p></details>
        <details><summary>Co zrobić, gdy nie znam odpowiedzi albo AI coś źle zrozumiało?</summary><p>„Nie mam takiego doświadczenia”, „Nie pamiętam” i pominięcie mają różne skutki. Przy doprecyzowaniu zobaczysz osobno wątpliwość AI i pełny proponowany opis. Możesz zatwierdzić cały opis, wpisać pełną poprawioną wersję albo zakończyć doprecyzowanie bez zapisywania niepotwierdzonej propozycji.</p></details>
        <details><summary>Jak wywiad zużywa kredyty AI?</summary><p>Wywiad wymaga aktywnego Pro. Pytania generowane przez AI, przygotowanie treści CV i osobna kontrola tej treści korzystają ze wspólnej puli kredytów. Nie ma stałej ceny całej rozmowy ani przelicznika „jeden kredyt = jedno pytanie”. Kolejne generowanie po zmianach może zużyć nowe kredyty, a wykonana operacja AI może kosztować także wtedy, gdy jej wynik wymaga poprawy.</p><p>Zapis odpowiedzi, zatwierdzanie faktów i ręczne zarządzanie profilem nie zużywają kredytów AI. Odpowiedź na już zapisane pytanie doprecyzowujące również nie wywołuje AI; późniejsze ponowne generowanie korzysta z kredytów. <Link to="/app/account">Sprawdź wykorzystanie planu</Link> lub <Link to="/pricing#wywiad">przeczytaj o Pro w cenniku</Link>.</p></details>
        <details><summary>Czy mogę przerwać rozmowę i wrócić później?</summary><p>Tak. Zapisane odpowiedzi pozostają na koncie również przy błędzie sieci lub braku kredytów. Rozmowę wznowisz w „Profilu zawodowym”, w widoku „Zapisane wywiady”. Przed zamknięciem karty zapisz bieżącą odpowiedź, ponieważ niewysłany tekst zniknie po ponownym uruchomieniu przeglądarki. Dalsze operacje AI wymagają aktywnego Pro i dostępnych kredytów.</p></details>
      </div>
      <Link className={classes.secondary} to="/app/interview">Przejdź do wywiadu · Pro <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="dopasowanie" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFileText /></SiteMarker><span className={classes.eyebrow}>TEMAT 03 · PRO</span></div>
      <h2>Dopasuj CV do konkretnej oferty</h2>
      <ol><li>Otwórz swoje CV i asystenta AI. Wybierz „Dopasuj do oferty”, dodaj ogłoszenie, a następnie „Dopasuj z wywiadem — nowe CV”.</li><li>AI zestawi wymagania oferty z wybranym CV i zatwierdzonymi informacjami tej rozmowy. Profil konta dołączysz wyłącznie przez „To moje CV — dołącz mój profil zawodowy”. Krótka runda do 5 pytań, łącznie z doprecyzowaniami, pomoże uzupełnić istotne informacje. Możesz też wpisać dodatkowe fakty ręcznie lub przejść do generowania bez tej rundy.</li><li>Przejdź do przygotowania CV, aby zapisać odpowiedzi. Sprawdź treść, proponowane zmiany oraz wymagania, których nadal nie udało się potwierdzić. W razie niejasności możesz odpowiedzieć na pytania doprecyzowujące.</li><li>Zapisz wynik jako nowe CV. Źródłowy dokument zachowa swoją treść; nową wersję dopracujesz w edytorze.</li></ol>
      <p>Oferta pomaga wybrać informacje warte pokazania, ale nie potwierdza Twoich umiejętności. Sprawdź proponowane opisy przed wysłaniem CV. Dopasowanie nie gwarantuje zaproszenia na rozmowę.</p>
      <Link className={classes.secondary} to="/app/documents">Wybierz CV do dopasowania <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="profil" tabIndex={-1} className={classes.guideStep}>
      <div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>TEMAT 04</span></div>
      <h2>Twój profil zawodowy i zapisane rozmowy</h2>
      <p>Profil to wspólna baza zatwierdzonych informacji do kolejnych CV. Wybierz sekcję i wpis, edytuj potrzebne pole, użyj „Zastosuj zmianę”, a następnie „Zapisz profil”. Zmiany nie przepisują automatycznie wcześniej zapisanych dokumentów.</p>
      <p>Przeglądanie, poprawianie i usuwanie profilu pozostaje dostępne bez kredytów, również po wygaśnięciu Pro. W widoku „Zapisane wywiady” znajdziesz rozmowy do wznowienia. Usunięcie rozmowy usuwa też jej osobne informacje. Fakty zapisane w profilu konta i gotowe CV pozostają; wyczyszczenie profilu nie usuwa historii rozmów ani dokumentów.</p>
      <Link className={classes.secondary} to="/app/career-profile">Otwórz profil zawodowy <FiArrowRight aria-hidden="true" /></Link>
    </section>
    <section id="import" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiUpload /></SiteMarker><span className={classes.eyebrow}>TEMAT 05</span></div><h2>Przenieś treść z obecnego CV</h2><p>Po założeniu konta wgraj CV w formacie PDF. CV Studio odczyta treść i umieści ją w wybranym szablonie. Sprawdź wynik przed pobraniem. Import nie kopiuje wyglądu oryginału, a odczytane dane mogą wymagać korekty. Plan Darmowy obejmuje jeden udany import miesięcznie.</p><p>W Pro po wypełnieniu CV danymi importu możesz wybrać „Uzupełnij CV przez wywiad”, aby dodać informacje o kolejnych doświadczeniach. <Link to="/help#wywiad">Zobacz instrukcję wywiadu</Link>.</p><Link className={classes.secondary} to="/app/import">Importuj CV z PDF<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="pobieranie" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiDownload /></SiteMarker><span className={classes.eyebrow}>TEMAT 06</span></div><h2>Zapisz projekt lub pobierz PDF</h2><p>„Zapisz” przechowuje edytowalną wersję CV na Twoim koncie. „Pobierz PDF” tworzy plik z aktualnego dokumentu, ale nie zapisuje ostatnich zmian w projekcie. Obie czynności wymagają konta. Jeśli zapis się nie powiedzie, zostaw kartę otwartą i ponów próbę z poziomu edytora.</p><Link className={classes.secondary} to="/pricing">Sprawdź limity planów<FiArrowRight aria-hidden="true" /></Link></section>
    <section id="powrot" tabIndex={-1} className={classes.guideStep}><div className={classes.stepHeading}><SiteMarker><FiFolder /></SiteMarker><span className={classes.eyebrow}>TEMAT 07</span></div><h2>Wróć do swojego CV</h2><p>Po zalogowaniu przejdź do „Moich dokumentów” i wybierz projekt, który chcesz edytować. Możesz też zapisać adres dokumentu w zakładkach; otworzy go tylko właściciel konta. Szkic utworzony bez logowania pozostaje w tej przeglądarce i zniknie po wyczyszczeniu jej danych.</p><Link className={classes.secondary} to="/app/documents">Otwórz moje dokumenty<FiArrowRight aria-hidden="true" /></Link></section>
    </div></div>
  </SiteLayout>;
}
