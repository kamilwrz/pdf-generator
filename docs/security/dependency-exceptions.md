# Dependency vulnerability exceptions

CV Studio blocks unaccepted Critical and High production-dependency findings in
CI. At 2026-09-01 there are no active exceptions.

An exception is a temporary risk decision, not a suppression without evidence.
Every exception must be added to the table below in the same pull request that
adjusts the scanner gate and must include:

- advisory identifier and affected package/version;
- production reachability and concrete impact analysis;
- named owner responsible for remediation;
- compensating control;
- approval date and an expiry date no more than 30 days later;
- upgrade, removal, or replacement issue.

Expired entries block deployment. The owner must remove the exception after
the dependency is fixed and attach the clean `pip-audit`, `npm audit --omit=dev`,
secret-scan, and CodeQL evidence to the change.

| Advisory | Dependency | Reachability and impact | Compensating control | Owner | Approved | Expires | Remediation issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _None_ | — | — | — | — | — | — | — |

---

# Wyjątki dla luk w zależnościach

CV Studio blokuje w CI niezaakceptowane podatności Critical i High w
zależnościach produkcyjnych. Na dzień 2026-09-01 nie ma aktywnych wyjątków.

Wyjątek jest tymczasową decyzją o ryzyku, a nie wyciszeniem bez dowodów. Każdy
wyjątek musi zostać dodany do poniższej tabeli w tym samym pull requeście, który
zmienia bramkę skanera, i musi zawierać:

- identyfikator podatności oraz pakiet/wersję;
- analizę osiągalności w produkcji i konkretnego wpływu;
- wskazanego właściciela odpowiedzialnego za naprawę;
- kontrolę kompensującą;
- datę akceptacji i termin ważności nie dłuższy niż 30 dni;
- zadanie aktualizacji, usunięcia albo zastąpienia zależności.

Wygasłe wpisy blokują wdrożenie. Po naprawie zależności właściciel usuwa wyjątek
i dołącza do zmiany czyste wyniki `pip-audit`, `npm audit --omit=dev`, skanowania
sekretów oraz CodeQL.

| Podatność | Zależność | Osiągalność i wpływ | Kontrola kompensująca | Właściciel | Akceptacja | Wygaśnięcie | Zadanie naprawcze |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _Brak_ | — | — | — | — | — | — | — |
