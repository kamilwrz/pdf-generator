import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate } from "./fillTemplate.js";

describe("fillTemplate", () => {
  it("posts cv_data and template_id through the provided ApiClient", async () => {
    const httpRequest = mock.fn(async () => ({ elements: [{ element_id: "a" }] }));
    const result = await fillTemplate(
      { name: "Anna" },
      "ledger",
      { api: { httpRequest }, errorMessage: "fail" },
    );
    assert.equal(httpRequest.mock.calls.length, 1);
    const [endpoint, method, body, message] = httpRequest.mock.calls[0].arguments;
    assert.equal(endpoint, "/ai/fill_template");
    assert.equal(method, "POST");
    assert.deepEqual(JSON.parse(body), { cv_data: { name: "Anna" }, template_id: "ledger" });
    assert.equal(message, "fail");
    assert.deepEqual(result.elements, [{ element_id: "a" }]);
  });

  it("rejects missing cv data", async () => {
    await assert.rejects(
      () => fillTemplate(null, "ledger", { api: { httpRequest: async () => ({}) } }),
      /Brak danych CV/,
    );
  });
});
