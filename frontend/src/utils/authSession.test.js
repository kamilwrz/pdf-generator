import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAccessToken,
  getAccessToken,
  getEditorPath,
  getSessionUsername,
  getUsernameFromToken,
  GUEST_WORKSPACE,
  isAuthFailure,
  setSessionUsername,
} from "./authSession.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

/** Build a minimal unsigned JWT whose payload is `claims`. */
function fakeJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
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

test("clearAccessToken removes the JWT and cached username", () => {
  globalThis.localStorage = fakeLocalStorage();
  localStorage.setItem("token", "abc");
  setSessionUsername("alice");
  clearAccessToken();
  assert.equal(getAccessToken(), null);
  assert.equal(getSessionUsername(), null);
});

test("getUsernameFromToken reads the JWT sub claim", () => {
  assert.equal(getUsernameFromToken(fakeJwt({ sub: "kamil" })), "kamil");
  assert.equal(getUsernameFromToken("not-a-jwt"), null);
  assert.equal(getUsernameFromToken(fakeJwt({ })), null);
});

test("getEditorPath uses guest or username workspace", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(getEditorPath(), `/cvstudio/${GUEST_WORKSPACE}`);
  assert.equal(getEditorPath({ start: "wizard" }), `/cvstudio/${GUEST_WORKSPACE}?start=wizard`);

  localStorage.setItem("token", fakeJwt({ sub: "anna" }));
  setSessionUsername("anna");
  assert.equal(getEditorPath(), "/cvstudio/anna");
  assert.equal(getEditorPath({ start: "demo" }), "/cvstudio/anna?start=demo");
});

test("getSessionUsername falls back to JWT sub for legacy sessions", () => {
  globalThis.localStorage = fakeLocalStorage();
  localStorage.setItem("token", fakeJwt({ sub: "legacy-user" }));
  assert.equal(getSessionUsername(), "legacy-user");
  assert.equal(localStorage.getItem("username"), "legacy-user");
});

test("isAuthFailure matches status and FastAPI default copy", () => {
  assert.equal(isAuthFailure({ status: 401, message: "x" }), true);
  assert.equal(isAuthFailure({ status: 403, message: "x" }), true);
  assert.equal(isAuthFailure({ message: "Not authenticated" }), true);
  assert.equal(isAuthFailure({ message: "Token jest nieprawidłowy lub wygasł" }), true);
  assert.equal(isAuthFailure({ message: "Nie udało się pobrać szkicu." }), false);
  assert.equal(isAuthFailure(null), false);
});
