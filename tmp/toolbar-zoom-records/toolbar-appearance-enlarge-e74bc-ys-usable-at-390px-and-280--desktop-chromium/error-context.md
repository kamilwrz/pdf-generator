# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: toolbar-appearance.spec.js >> enlarged record toolbar stays usable at 390px and 280%
- Location: e2e\toolbar-appearance.spec.js:291:3

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of null (reading 'click')
    at eval (eval at evaluate (:311:30), <anonymous>:3:55)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- main [ref=f1e3]:
  - complementary [ref=f1e4]:
    - link "CV Studio — strona główna" [ref=f1e6] [cursor=pointer]:
      - /url: /
    - generic [ref=f1e8]:
      - button "Zdjęcie profilowe" [ref=f1e9] [cursor=pointer]
      - button "Dostosuj CV" [ref=f1e15] [cursor=pointer]
      - button "Edytuj jako kopię" [ref=f1e20] [cursor=pointer]
    - generic [ref=f1e26]:
      - link "Moje dokumenty" [ref=f1e27] [cursor=pointer]:
        - /url: /app/documents
      - button "Szybko otwórz dokument" [ref=f1e31] [cursor=pointer]
    - generic [ref=f1e35]:
      - link "Konto i plan" [ref=f1e36] [cursor=pointer]:
        - /url: /app/account
      - button "Pro" [ref=f1e42] [cursor=pointer]
      - 'generic "Kredyty AI: wykorzystano 0 z 200" [ref=f1e43]':
        - generic [ref=f1e44]: "200"
        - generic [ref=f1e45]: AI
      - button "Wyloguj się" [ref=f1e46] [cursor=pointer]
  - generic [ref=f1e49]:
    - generic [ref=f1e50]:
      - generic [ref=f1e51]:
        - group "Tworzenie CV" [ref=f1e52]:
          - button "Importuj PDF" [ref=f1e53] [cursor=pointer]
          - button "Nowe CV" [ref=f1e56] [cursor=pointer]
        - group "Strony i paginacja" [ref=f1e59]:
          - button "Poprzednia strona" [disabled] [ref=f1e60]
          - generic [ref=f1e63]: 1/1
          - button "Utwórz następną stronę" [ref=f1e64] [cursor=pointer]
      - generic [ref=f1e67]:
        - group "Historia zmian" [ref=f1e68]:
          - button "Cofnij" [disabled] [ref=f1e69]
          - button "Ponów" [disabled] [ref=f1e72]
        - group "Szablon CV" [ref=f1e75]:
          - 'button "Poprzedni szablon: Atrium" [ref=f1e77] [cursor=pointer]'
          - button "Zmień szablon" [ref=f1e80] [cursor=pointer]
          - 'button "Następny szablon: Regent" [ref=f1e85] [cursor=pointer]'
        - group "Widok dokumentu" [ref=f1e88]:
          - generic [ref=f1e89]:
            - button "Pomniejsz" [ref=f1e90] [cursor=pointer]
            - generic [ref=f1e94]: 140%
            - button "Powiększ" [ref=f1e95] [cursor=pointer]
          - button "Włącz widok dwóch stron" [disabled] [ref=f1e99]
      - group "Operacje dokumentu" [ref=f1e104]:
        - button "Wyczyść zawartość CV" [ref=f1e105] [cursor=pointer]
        - generic [ref=f1e108]:
          - textbox "Nazwa bieżącego dokumentu" [ref=f1e109]:
            - /placeholder: Projekt bez tytułu
            - text: CV Smoke
          - button "Zmień nazwę dokumentu" [ref=f1e110] [cursor=pointer]
        - button "Zapisz dokument" [ref=f1e113] [cursor=pointer]
        - button "Pobierz PDF" [ref=f1e118] [cursor=pointer]
    - generic [ref=f1e125]:
      - generic:
        - generic:
          - paragraph: Kamil Smoke
        - generic:
          - paragraph: UMIEJĘTNOŚCI
        - generic: Narzędzia
        - generic: Figma · Miro
        - generic: Technologie
        - generic: React · TypeScript
  - button "Otwórz asystenta AI" [ref=f1e133] [cursor=pointer]:
    - generic [ref=f1e136]: Asystent AI
  - status [ref=f1e137]:
    - generic [ref=f1e141]:
      - generic [ref=f1e142]: Edytuj bezpośrednio na CV
      - generic [ref=f1e143]: Najedź na sekcję lub wpis, aby zobaczyć kontrolki. Kliknij tekst raz, aby go edytować.
    - button "Zamknij" [ref=f1e144] [cursor=pointer]
```