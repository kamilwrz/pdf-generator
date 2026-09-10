from pathlib import Path

def replace(path, old, new):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert old in s, (path, old[:80])
    p.write_text(s.replace(old, new), encoding='utf-8')

public = 'frontend/src/pages/Site/PublicPages.jsx'
guide = '''    <section id="wywiad" tabIndex={-1} className={classes.guideStep}>
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
'''
replace(public, '    <section id="import"', guide + '    <section id="import"')
for old,new in [('KROK 01','TEMAT 01'),('KROK 02','TEMAT 05'),('KROK 03','TEMAT 06'),('KROK 04','TEMAT 07')]:
    replace(public,old,new)
replace(public, 'Plan Darmowy obejmuje jeden udany import miesięcznie.</p>', 'Plan Darmowy obejmuje jeden udany import miesięcznie.</p><p>W Pro po wypełnieniu CV danymi importu możesz wybrać „Uzupełnij CV przez wywiad”, aby rozwinąć opisy o dodatkowe doświadczenia. <Link to="/help#wywiad">Zobacz instrukcję wywiadu</Link>.</p>')

replace('frontend/src/pages/Hero/Hero.jsx', '<h3>Opisz doświadczenie konkretniej</h3>', '<h3>Wywiad w Pro: wydobądź więcej ze swojego doświadczenia</h3>')
replace('frontend/src/pages/Hero/Hero.jsx', '<p>AI w Pro pomoże skrócić opisy, poprawić język i dopasować CV do oferty pracy. Ty wybierasz, które zmiany zastosować.</p>', '<p>Odpowiedz na pytania o swoją pracę, projekty i rezultaty. Wywiad AI pomoże uzupełnić CV lub przygotować nową wersję pod ofertę. Ty zatwierdzasz informacje. Rozmowa i generowanie korzystają z kredytów Pro.</p><CtaLink to="/help#wywiad" variant="link">Zobacz, jak działa wywiad</CtaLink><p>W edytorze AI pomoże też skrócić opis lub poprawić jego styl:</p>')

replace('frontend/src/pages/Site/DocumentsPage.jsx', "import { HeroNote, SiteMarker }", "import { useEntitlements } from '../../hooks/useEntitlements';\nimport { HeroNote, SiteMarker }")
replace('frontend/src/pages/Site/DocumentsPage.jsx', 'export default function DocumentsPage() {', 'export default function DocumentsPage() {\n  const { entitlements } = useEntitlements();')
replace('frontend/src/pages/Site/DocumentsPage.jsx', 'heroAside={<HeroNote', 'heroAside={entitlements?.ai_assistant === true ? <HeroNote icon={<FiFileText />} label="WYWIAD · MASZ DOSTĘP W PRO" title="Nie wiesz, jak opisać swoje doświadczenie?"><p>Odpowiedz na pytania o działania i rezultaty. Zatwierdź informacje i przygotuj treść nowego CV. Wywiad korzysta z kredytów AI.</p><Link className={classes.secondary} to="/app/interview">Utwórz CV z pomocą wywiadu <FiArrowRight aria-hidden="true" /></Link><Link to="/help#dopasowanie">Chcę dopasować obecne CV do oferty</Link></HeroNote> : <HeroNote')

account='frontend/src/pages/Site/AccountPage.jsx'
replace(account,'    <div className={classes.settingsGrid}>','''    {entitlements?.ai_assistant === true && <section className={classes.supportPanel} aria-labelledby="pro-interview-heading"><SiteMarker><FiZap /></SiteMarker><div><p className={classes.eyebrow}>WYWIAD · W TWOIM PRO</p><h2 id="pro-interview-heading">Zacznij od rozmowy o swoim doświadczeniu</h2><p>Wywiad pomoże nazwać konkretne działania i osiągnięcia, a potem przygotować treść CV. Możesz zacząć bez dokumentu lub wskazać własne CV. Pytania i generowanie korzystają z Twojej puli kredytów AI.</p><div className={classes.actions}><Link className={classes.primary} to="/app/interview">Utwórz CV z pomocą wywiadu <FiZap aria-hidden="true" /></Link><Link to="/help#wywiad">Jak działa wywiad</Link><Link to="/app/career-profile">Profil i zapisane rozmowy</Link></div></div></section>}
    <div className={classes.settingsGrid}>''')

replace('frontend/src/pages/Site/InterviewPage.jsx','intro="Odkryj i opisz doświadczenia, które warto pokazać w CV."','eyebrow="WYWIAD · PRO" intro="Odpowiedz na pytania o swoje działania i rezultaty. Zatwierdź informacje, sprawdź treść i zapisz nowe CV. Pytania AI i generowanie korzystają z kredytów Pro."')
replace('frontend/src/components/ai/Interview/InterviewFlow.jsx','<Link className={classes.link} to="/app/career-profile">Profil i zapisane wywiady</Link>', '<Link className={classes.link} to="/app/career-profile">Profil i zapisane wywiady</Link><Link className={classes.link} to="/help#wywiad" target="_blank" rel="noopener noreferrer">Pomoc do wywiadu (nowa karta)</Link>')

# Keep the chooser's established actions; explain its existing interview entry.
replace('frontend/src/components/editor/StartChooser/StartChooser.jsx','<Link className={classes.blankLink} to="/app/interview">Utwórz CV z pomocą wywiadu →</Link>', '<div><Link className={classes.blankLink} to="/app/interview">Utwórz CV z pomocą wywiadu · Pro →</Link><p className={classes.documentsEmpty}>Odpowiedz na pytania o doświadczenie, zatwierdź informacje i przygotuj treść CV. Wywiad korzysta z kredytów AI. <Link className={classes.blankLink} to="/help#wywiad">Jak działa wywiad</Link></p></div>')

# Shared plan copy already feeds landing, registration and the plan picker.
replace('frontend/src/utils/planPresentation.test.js', 'assert.deepEqual(PRO_PLAN_HIGHLIGHTS, [\n', 'assert.deepEqual(PRO_PLAN_HIGHLIGHTS, [\n        "Wywiad AI: opisz doświadczenie i przygotuj CV pod ofertę",\n        "Profil zawodowy z informacjami do kolejnych CV",\n')
replace('frontend/src/utils/planPresentation.test.js', '"200 kredytów AI",', '"200 kredytów na wywiad i pozostałe funkcje AI",')
