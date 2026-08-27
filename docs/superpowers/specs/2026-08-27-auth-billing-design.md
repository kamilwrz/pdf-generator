# Specyfikacja: Google login, weryfikacja email, płatności Stripe

Data: 2026-08-27
Status: zaakceptowana (brainstorming) — oczekuje na plan implementacji

## 1. Cel i kontekst

Aplikacja CV Studio ma dziś logowanie wyłącznie na login + hasło (JWT w
`localStorage`), plan Pro aktywowany bez płatności (`ALLOW_UNPAID_PLAN_SELECTION`)
oraz zostawione „szwy" pod Stripe. Ta specyfikacja dodaje trzy funkcje:

1. **Logowanie przez Google** (Google Identity Services, auto-łączenie po emailu).
2. **Weryfikację adresu email po rejestracji** (Resend, blokada logowania do
   potwierdzenia).
3. **Płatności Stripe** dla planu Pro jako **jednorazowy pass 30 dni**
   (Checkout `mode=payment` + webhook).

### Decyzje produktowe (z brainstormingu)

| Decyzja | Wybór |
|---------|-------|
| Model płatności Pro | Jednorazowy pass 30 dni (Checkout `mode=payment`), zgodny z `PRO_PASS_DAYS=30` |
| Dostawca email | Resend (transakcyjne API HTTP) |
| Egzekwowanie weryfikacji | Blokada logowania do potwierdzenia adresu |
| Google a konta hasłowe | Auto-link po adresie email + auto-tworzenie konta |

### Decyzje techniczne (rekomendacje przyjęte)

- **Google**: Google Identity Services po stronie klienta → `id_token` →
  weryfikacja na backendzie (`google-auth`) → wydanie własnego JWT. Bez
  server-side sesji ani redirect-callbacków.
- **Token weryfikacji email**: podpisany JWT z claimem `purpose="verify_email"`,
  `exp=+24h`. Bezstanowy, bez nowej tabeli.
- **Rozdzielenie stanów konta**: nowa kolumna `is_verified` (weryfikacja email),
  `is_active` zostaje na blokadę/ban konta.

## 2. Stan obecny (na czym budujemy)

- `backend/app/api/routes/auth.py` — `/auth/register`, `/auth/token`,
  `/auth/verify-token/{token}`, `/auth/me/entitlements`.
- `backend/app/api/routes/billing.py` — `/billing/plans`, `/billing/select-plan`
  (zawiera seam `402 payment_required` z polem `checkout_url: None`),
  `/billing/admin/reset-ai-credits`.
- `backend/app/core/security.py` — hash bcrypt, `create_access_token`,
  `verify_token`. **Uwaga:** `login_for_access_token` nie sprawdza dziś
  `is_active`.
- `backend/app/crud/user.py` — `create_user` ustawia `is_active=True`;
  `authenticate_user` zwraca użytkownika lub `False`.
- `backend/app/models/models.py` — `User(username, email, hashed_password,
  created_at, is_active)`; `Plan.stripe_price_id_monthly`;
  `UserSubscription.stripe_customer_id/stripe_subscription_id`; tabela `Payment`
  (provider, provider_ref, amount_cents, currency, status, raw). Model danych
  Stripe jest gotowy.
- `backend/app/services/entitlements.py` — `set_user_plan(pro)` startuje
  30-dniowy pass i resetuje kredyty AI; `bootstrap_billing` seeduje katalog.
- Frontend: JWT w `localStorage` (`token`), helpery w
  `frontend/src/utils/authSession.js`; strony `/login`, `/register`;
  `PlanSelectModal` już czyta `checkout_url`; brak `AuthContext`.
- `backend/requirements.txt` — brak `stripe`, `google-auth`, klienta email.

## 3. Zmiany w modelu danych (jedna migracja Alembic)

Tabela `users`, nowe kolumny:

| Kolumna | Typ | Default | Uwagi |
|---------|-----|---------|-------|
| `is_verified` | Boolean | `False` | Nowe rejestracje hasłem = `False`. **Backfill istniejących → `True`.** |
| `auth_provider` | String | `"password"` | `"password"` \| `"google"`. Informacyjne + logika „brak hasła". |
| `google_sub` | String, nullable, **unique** | `NULL` | Stabilne `sub` z Google id_token. |

Zmiana istniejącej kolumny:

- `hashed_password` → **nullable** (konta czysto-Google nie mają hasła).

Migracja musi:
1. Dodać kolumny z powyższymi defaultami.
2. Wykonać `UPDATE users SET is_verified = TRUE` (backfill — nie blokować
   istniejących kont po wdrożeniu blokady logowania).
3. Nie zmieniać tabel `Plan` / `UserSubscription` / `Payment` (pola Stripe już są).

Model SQLAlchemy `User` aktualizowany zgodnie z powyższym.

## 4. Faza 0 — Migracja i model

Zakres: sekcja 3 (kolumny + backfill + aktualizacja modelu). Warunek wstępny dla
wszystkich pozostałych faz. Bez zmian w API i UI.

Testy: migracja podnosi się na czystej i istniejącej bazie; istniejący
użytkownik po migracji ma `is_verified=True`.

## 5. Faza 1 — Weryfikacja email (Resend)

### Backend

- **Nowy moduł** `backend/app/services/email_service.py`:
  - `send_verification_email(to: str, verify_url: str) -> None` — klient HTTP
    Resend. Gdy `RESEND_API_KEY` jest pusty, moduł loguje i pomija wysyłkę
    (tryb lokalny/dev), nie rzuca wyjątku blokującego rejestrację.
  - Treść maila po polsku, nadawca z `EMAIL_FROM`.
- **Token weryfikacji** (w `security.py` lub nowym helperze):
  - `create_email_verification_token(email)` → JWT `{"sub": email,
    "purpose": "verify_email", "exp": +24h}`.
  - `verify_email_token(token)` → waliduje podpis, `exp`, `purpose`; zwraca email
    lub rzuca 400 z kodem `invalid_or_expired_token`.
- **`/auth/register`** (zmiana): tworzy usera z `is_verified=False`, generuje
  token, wysyła mail, zwraca komunikat „sprawdź skrzynkę" (nie loguje od razu).
- **Nowe endpointy** w `auth.py`:
  - `GET /auth/verify-email?token=...` → waliduje → `is_verified=True` → zwraca
    JSON sukcesu (FE pokazuje ekran „potwierdzono, zaloguj się").
  - `POST /auth/resend-verification` (body: `{email}`) → jeśli istnieje
    niezweryfikowany user, wystaw nowy token i wyślij. **Odpowiedź zawsze taka
    sama** (nie ujawnia istnienia konta). Rate-limit: min. 60 s między wysyłkami
    na adres.
- **Blokada logowania** w `login_for_access_token`: po `authenticate_user`
  sprawdź `user.is_verified`; jeśli `False` → `HTTPException(403, detail={
  "code": "email_unverified", "message": ...})`.

### Frontend

- Nowa trasa `/verify-email` — czyta `token` z query, woła
  `GET /auth/verify-email`, pokazuje sukces/błąd + link do logowania.
- Ekran po rejestracji: „Wysłaliśmy link na {email}" + przycisk „Wyślij
  ponownie" (woła `/auth/resend-verification`, z blokadą 60 s).
- Obsługa kodu `email_unverified` na stronie logowania (komunikat + link do
  ponownej wysyłki).

### Env

- `RESEND_API_KEY` (pusty = wysyłka wyłączona, dev).
- `EMAIL_FROM` (np. `CV Studio <noreply@twojadomena.pl>`).
- `FRONTEND_URL` (bazowy URL do budowy linku weryfikacyjnego).

### Bezpieczeństwo

- `resend-verification` nie ujawnia istnienia konta.
- Token krótkoterminowy (24 h), podpisany `SECRET_KEY`.
- Brak PII w URL poza adresem email w podpisanym tokenie.

### Testy

- Token: ważny / wygasły / zły `purpose` / zły podpis.
- Rejestracja tworzy niezweryfikowanego usera i „wysyła" mail (mock Resend).
- Logowanie niezweryfikowanego → 403 `email_unverified`.
- Logowanie po weryfikacji → 200 z JWT.
- `resend-verification` — identyczna odpowiedź dla istniejącego i nieistniejącego
  adresu.

## 6. Faza 2 — Google login (auto-link po emailu)

### Backend

- **Zależność**: `google-auth`.
- **Nowy endpoint** `POST /auth/google` (body: `{id_token}`):
  1. Weryfikuj `id_token` przez `google.oauth2.id_token.verify_oauth2_token`
     z `audience=GOOGLE_CLIENT_ID`. Nieprawidłowy → 401 `invalid_google_token`.
  2. Wyciągnij `email`, `email_verified`, `sub`, `name`. Odrzuć, gdy
     `email_verified` jest fałszywe.
  3. **Logika łączenia**:
     - user z tym `google_sub` → zaloguj;
     - user z tym `email` → dolinkuj (`google_sub`), ustaw `is_verified=True`
       (Google potwierdził adres — rozwiązuje też przypadek „zarejestrowany
       hasłem, niezweryfikowany, loguje się Google");
     - brak → utwórz konto: `is_verified=True`, `hashed_password=NULL`,
       `auth_provider="google"`, unikalny `username` wygenerowany z części
       lokalnej emaila/imienia (z rozwiązywaniem kolizji), plus Free subscription
       (`ensure_free_subscription`).
  4. Wydaj własny JWT — identyczny kontrakt zwrotny jak `/auth/token`
     (`{access_token, token_type}`), dołóż `username` do odpowiedzi dla FE.

### Frontend

- Załadowanie skryptu Google Identity Services.
- Przycisk „Zaloguj z Google" na `/login` i `/register`.
- Callback GIS → `POST /auth/google` → zapis JWT + `setSessionUsername` →
  redirect do edytora z zachowaniem `start`-intent (jak obecny flow).

### Env / zależności

- `GOOGLE_CLIENT_ID` (backend do weryfikacji audience, frontend do inicjalizacji
  GIS).
- `google-auth` w `requirements.txt`.

### Testy

- Nowy email → tworzy konto zweryfikowane bez hasła.
- Istniejący email (konto hasłowe) → dolinkowanie + `is_verified=True`.
- Istniejący `google_sub` → logowanie bez duplikatu.
- Nieprawidłowy / `email_verified=false` id_token → odrzucenie.
- Kolizja `username` → wygenerowany unikalny login.

## 7. Faza 3 — Stripe Checkout (jednorazowy pass 30 dni)

### Backend

- **Zależność**: `stripe`.
- **`/billing/select-plan`** — wypełnienie istniejącego szwu: gdy `plan=pro`
  i `ALLOW_UNPAID_PLAN_SELECTION=False`, zamiast `402` utwórz **Checkout
  Session**:
  - `mode="payment"` (jednorazowa płatność),
  - `line_items` z `STRIPE_PRICE_PRO` (jednorazowa cena 59 zł),
  - `client_reference_id=str(user.id)`,
  - `success_url` / `cancel_url` wskazujące na `FRONTEND_URL`,
  - zwróć `{checkout_url: session.url, payment_required: True}`.
  Gdy `ALLOW_UNPAID_PLAN_SELECTION=True` — dotychczasowe natychmiastowe
  aktywowanie (dev) pozostaje.
- **Nowy endpoint** `POST /billing/webhook`:
  1. Odczyt **surowego body** (`await request.body()`) + nagłówka
     `Stripe-Signature`; weryfikacja `stripe.Webhook.construct_event` z
     `STRIPE_WEBHOOK_SECRET`. Zły podpis → 400.
  2. `checkout.session.completed`:
     - **Idempotencja**: jeśli istnieje `Payment.provider_ref == session.id`,
       zwróć 200 bez zmian.
     - inaczej: `set_user_plan(user_id, "pro")` (30-dniowy pass + reset kredytów
       AI), zapis `Payment(provider="stripe", provider_ref=session.id,
       plan_slug="pro", amount_cents, currency, status="succeeded", raw=event)`,
       zapis `stripe_customer_id` na `UserSubscription`.
  3. Inne typy eventów → 200 (zignorowane, zalogowane).
  - **Router webhooka** musi omijać globalny JSON-parsing (surowe bajty).

### Frontend

- Strony/trasy `success` i `cancel` (po powrocie ze Stripe): `success` re-fetchuje
  entitlements i pokazuje „Pro aktywne"; `cancel` wraca do planu.
- `PlanSelectModal` już przekierowuje na `checkout_url` — pozostaje.

### Env / zależności

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`.
- `stripe` w `requirements.txt`.
- `Plan.stripe_price_id_monthly` może przechowywać ID ceny.

### Bezpieczeństwo

- Aktywacja planu **wyłącznie** z podpisanego webhooka, nigdy z `success_url`
  (który można sfałszować).
- Idempotencja chroni przed podwójnym naliczeniem przy retry Stripe.

### Testy

- Webhook: poprawny podpis / zły podpis.
- Idempotencja: dwa identyczne eventy → jedna aktywacja, jeden `Payment`.
- Po `checkout.session.completed` → user na Pro z 30-dniowym passem.
- `select-plan` w trybie produkcyjnym → zwraca `checkout_url` zamiast 402.

## 8. Podsumowanie zmiennych środowiskowych

| Zmienna | Faza | Wymagana | Opis |
|---------|------|----------|------|
| `RESEND_API_KEY` | 1 | prod | Klucz Resend; pusty = wysyłka wyłączona (dev) |
| `EMAIL_FROM` | 1 | prod | Adres nadawcy maili |
| `FRONTEND_URL` | 1, 3 | tak | Bazowy URL do linków weryfikacji i powrotu ze Stripe |
| `GOOGLE_CLIENT_ID` | 2 | tak | Weryfikacja audience id_token + init GIS |
| `STRIPE_SECRET_KEY` | 3 | prod | Klucz API Stripe |
| `STRIPE_WEBHOOK_SECRET` | 3 | prod | Weryfikacja podpisu webhooka |
| `STRIPE_PRICE_PRO` | 3 | prod | ID jednorazowej ceny Pro (59 zł) |

## 9. Roadmapa i kolejność

| Faza | Zakres | Zależy od | Ryzyko |
|------|--------|-----------|--------|
| 0 | Migracja (`is_verified`, `auth_provider`, `google_sub`, `hashed_password` nullable + backfill) + model | — | niskie |
| 1 | Weryfikacja email (Resend, tokeny, blokada logowania, ekrany FE) | 0 | średnie (dostarczalność) |
| 2 | Google login (GIS + `/auth/google`, auto-link, ekrany FE) | 0 | średnie (config OAuth) |
| 3 | Stripe Checkout + webhook + strony success/cancel | 0 | wyższe (webhook, idempotencja) |

Fazy 1 i 2 są niezależne (obie zależą tylko od 0) — można zrównoleglić.
Faza 3 rekomendowana na końcu (najwięcej testów integracyjnych i konfiguracji
zewnętrznej).

## 10. Poza zakresem (naturalne follow-upy)

- Reset hasła (infrastruktura email będzie już gotowa).
- Portal zarządzania płatnością / historia płatności dla użytkownika.
- Faktury / dane do faktury.

## 11. Wymagania dokumentacyjne

Zgodnie z `CLAUDE.md`: po każdej fazie aktualizacja `README.md` (EN + PL) w
sekcjach auth, billing, API, zmienne środowiskowe, testy oraz komentarze w kodzie
dla nietrywialnej logiki (weryfikacja tokenów, łączenie kont, idempotencja
webhooka).
