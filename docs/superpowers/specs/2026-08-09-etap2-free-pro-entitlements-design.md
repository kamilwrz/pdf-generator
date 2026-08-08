# Etap 2 — Free/Pro entitlements — implemented

**Date:** 2026-08-09 (drafted 2026-08-08; implemented 2026-08-08)
**Status:** Implemented in code (catalog + gates + UI). Stripe Checkout still deferred.

---

## Shipped offer

| | Darmowy (Free) | Pro |
|--|--|--|
| Price | 0 zł | **59 zł / 30 days** (one-shot pass) |
| Templates | 5 starters | all 14 |
| Import | 1 lifetime free | further imports via AI credits |
| Export | watermark | clean |
| AI | — | content + ATS + Layout |
| Credits | 0 | **200** / period |
| Projects / exports | 1 / 3 per month | unlimited |

Legacy `standard` / `premium` → `pro`. Expired Pro downgrades to Free; documents kept.

## Primary implementation files

- `backend/app/services/entitlements.py` — `PLAN_SEEDS`, `PLAN_DISPLAY`, migrations, gates
- `backend/app/api/routes/billing.py` — catalog + select-plan
- `frontend/src/components/modals/PlanSelectModal/PlanSelectModal.jsx`
- `frontend/src/pages/Hero/Hero.jsx` — pricing + FAQ
- `README.md` — EN/PL feature docs

## Still out of scope

- Stripe Checkout / webhooks
- Auto-renewing subscription
- Advertising “unlimited AI” (fair-use credits remain)
