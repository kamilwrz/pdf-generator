# CV Studio onboarding robot

## English

`CvOnboarding.jsx` renders `FaRobot` from the existing `react-icons/fa` package beside each step heading. The icon inherits the shared `--color-editor-ink` brown on white paper. Its box is 96px, reduced to 64px below 768px width or at most 800px height, with token-based internal padding.

`CvOnboarding.module.css` animates a gentle greeting tilt once per step for three slow motion intervals (960ms). The SVG is keyed by the step, so editing form values does not restart it. Only transforms animate; the heading and form stay still and usable. Reduced motion renders the resting pose without animation. The gesture is decorative, never a progress indicator or a claim that AI is running.

The wrapper has `aria-hidden="true"` and the SVG has `focusable="false"`; adjacent screen-reader text retains the CV Assistant label. The robot never enters document data or PDF output. No additional dependency, image request, loading state or image-error fallback is needed. The previous generated portrait asset has been removed. Tests live in `frontend/e2e/cv-onboarding.spec.js`.

## Polski

`CvOnboarding.jsx` wyświetla `FaRobot` z obecnego pakietu `react-icons/fa` obok nagłówka każdego etapu. Ikona korzysta ze wspólnego brązu `--color-editor-ink` na białym tle. Jej pole ma 96 px, zmniejszane do 64 px poniżej szerokości 768 px lub przy wysokości do 800 px, z wewnętrznym odstępem opartym na tokenie.

`CvOnboarding.module.css` animuje delikatny powitalny przechył raz na etap przez trzy długie interwały ruchu (960 ms). SVG ma klucz zależny od etapu, więc edycja formularza nie uruchamia animacji ponownie. Zmienia się tylko transformacja; nagłówek i formularz pozostają nieruchome i dostępne. Ograniczenie animacji pozostawia statyczną pozę. Gest jest dekoracyjny i nie oznacza postępu ani działania AI.

Kontener ma `aria-hidden="true"`, a SVG `focusable="false"`; sąsiadujący tekst dla czytników ekranu zachowuje etykietę Asystent CV. Robot nie trafia do danych dokumentu ani PDF. Nie wymaga dodatkowej zależności, pobrania obrazu, stanu ładowania ani zastępczego obrazu po błędzie. Poprzedni wygenerowany portret został usunięty. Testy znajdują się w `frontend/e2e/cv-onboarding.spec.js`.
