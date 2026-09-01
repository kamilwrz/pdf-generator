import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { ApiClient } from "./api.js";

afterEach(() => mock.restoreAll());

test("ApiClient merges per-request headers over client defaults", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer account-token");
    assert.equal(options.headers["Idempotency-Key"], "logical-create-key");
    assert.equal(options.headers["X-Request-Scope"], "request");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const api = new ApiClient({
    Authorization: "Bearer account-token",
    "X-Request-Scope": "client",
  });

  await api.httpRequest("/test", "POST", JSON.stringify({}), "request failed", {
    headers: {
      "Idempotency-Key": "logical-create-key",
      "X-Request-Scope": "request",
    },
  });

  assert.equal(fetchMock.mock.callCount(), 1);
});

test("ApiClient keeps the same per-request idempotency key across retries", async () => {
  const observedKeys = [];
  mock.method(globalThis, "fetch", async (_url, options) => {
    observedKeys.push(options.headers["Idempotency-Key"]);
    if (observedKeys.length === 1) {
      return new Response(JSON.stringify({ detail: "temporary" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ created: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const api = new ApiClient();

  await api.httpRequest("/test", "POST", JSON.stringify({}), "request failed", {
    retries: 1,
    retryDelayMs: 0,
    headers: { "Idempotency-Key": "stable-retry-key" },
  });

  assert.deepEqual(observedKeys, ["stable-retry-key", "stable-retry-key"]);
});
