# CV Studio onboarding illustration

## English

`frontend/public/cv-onboarding-guide.png` is an original static illustration generated for this project with the OpenAI image-generation tool on 2026-09-19. It represents a fictional adult assistant, not an identified person or a credentialed expert. It is displayed only in the application onboarding, with the caption “CV Assistant”. It is decorative (`alt=""`), is not sent to the CV renderer, and is absent from PDF exports.

`CvOnboarding.module.css` uses the shared white/brown palette. The illustration measures 176 px on desktop and 112 px on compact screens; template selection uses 96 px and 64 px respectively so the task stays prominent. There is no voice, autoplay or waiting screen. A document icon replaces a failed image request.

## Polski

`frontend/public/cv-onboarding-guide.png` to autorska statyczna ilustracja wygenerowana dla tego projektu narzędziem OpenAI do generowania obrazów 2026-09-19. Przedstawia fikcyjną dorosłą asystentkę, bez wskazywania konkretnej osoby i deklarowania kwalifikacji. Pojawia się wyłącznie w onboardingu aplikacji, z podpisem „Asystent CV”. Jest dekoracyjna (`alt=""`), nie trafia do renderera CV ani eksportu PDF.

`CvOnboarding.module.css` korzysta ze wspólnej biało-brązowej palety. Ilustracja ma 176 px na komputerze i 112 px na małym ekranie; podczas wyboru szablonu odpowiednio 96 px i 64 px, aby pozostawić miejsce na zadanie. Nie ma głosu, automatycznego odtwarzania ani ekranu oczekiwania. Przy błędzie odczytu obrazu zastępuje go ikona dokumentu.

## Generation prompt / Prompt generowania

```text
Use case: illustration-story. Asset type: small static onboarding guide portrait for CV Studio, a calm professional CV editor with a Swiss editorial design system. Create one original illustrated adult female virtual assistant, chest-up, centered, facing the viewer, friendly subtle natural smile, dark brown shoulder-length hair, warm beige plain blouse, holding a simple blank white document at lower chest. Elegant flat editorial illustration with delicate confident brown outlines, restrained simple geometry, warm human character, not cartoon mascot, not photorealistic, not 3D. Color palette exclusively warm neutrals: dark brown #674E3E, accent #8A664F, warm beige #F5F1E8, paper white, naturally warm muted skin. Plain pure white background, generous clear margin around the entire bust, no frame, no circles, no blobs, no gradients, no shadow, no decorations. Square composition. No words, no letters, no logo, no interface. Optimise recognisability at 120px and 176px display sizes. Return a clean production illustration.
```
