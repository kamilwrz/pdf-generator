import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAccessToken,
  getAccessToken,
  isAuthFailure,
} from "./authSession.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("getAccessToken returns null for missing and placeholder values", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(getAccessToken(), null);
  localStorage.setItem("token", "null");
  assert.equal(getAccessToken(), null);
  localStorage.setItem("token", "undefined");
  assert.equal(getAccessToken(), null);
  localStorage.setItem("token", "   ");
  assert.equal(getAccessToken(), null);
  localStorage.setItem("token", "real.jwt.value");
  assert.equal(getAccessToken(), "real.jwt.value");
});

test("clearAccessToken removes the JWT", () => {
  globalThis.localStorage = fakeLocalStorage();
  localStorage.setItem("token", "abc");
  clearAccessToken();
  assert.equal(getAccessToken(), null);
});

test("isAuthFailure matches status and FastAPI default copy", () => {
  assert.equal(isAuthFailure({ status: 401, message: "x" }), true);
  assert.equal(isAuthFailure({ status: 403, message: "x" }), true);
  assert.equal(isAuthFailure({ message: "Not authenticated" }), true);
  assert.equal(isAuthFailure({ message: "Token jest nieprawidłowy lub wygasł" }), true);
  assert.equal(isAuthFailure({ message: "Nie udało się pobrać szkicu." }), false);
  assert.equal(isAuthFailure(null), false);
});
