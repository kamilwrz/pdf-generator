import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (relativePath) => readFile(new URL(relativePath, root), "utf8");

test("password registration waits for email verification and Google uses the shared session", async () => {
  const [register, verify, authApi] = await Promise.all([
    source("pages/Register/Register.jsx"),
    source("pages/Auth/VerifyEmail.jsx"),
    source("services/authApi.js"),
  ]);
  assert.match(register, /setVerificationPending\(true\)/);
  assert.doesNotMatch(register, /await signIn\(username, password/);
  assert.match(register, /savePendingAuthIntent\(searchParams\)/);
  assert.match(verify, /verifyEmail\(token\)/);
  assert.match(verify, /getPendingAuthIntent/);
  assert.match(authApi, /ENDPOINTS\.AUTH\.GOOGLE/);
  assert.match(authApi, /establishSession\(data\)/);
});

test("Pro checkout supplies an idempotency key and never activates from the return page", async () => {
  const [modal, result] = await Promise.all([
    source("components/modals/PlanSelectModal/PlanSelectModal.jsx"),
    source("pages/Billing/CheckoutResult.jsx"),
  ]);
  assert.match(modal, /"Idempotency-Key": globalThis\.crypto\?\.randomUUID/);
  assert.match(modal, /url\.hostname === "checkout\.stripe\.com"/);
  assert.match(modal, /window\.location\.assign\(checkoutUrl\)/);
  assert.match(result, /ENDPOINTS\.BILLING\.CHECKOUT_SESSION/);
  assert.doesNotMatch(result, /ENDPOINTS\.BILLING\.SELECT_PLAN|setUserPlan|activatePlan/);
});
