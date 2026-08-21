import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate } from "./fillTemplate.js";

describe("fillTemplate", () => {
  it("posts cv_data and template_id through the provided ApiClient", async () => {
    const httpRequest = mock.fn(async () => ({ elements: [{ element_id: "a" }] }));
    const result = await fillTemplate(
      { name: "Anna" },
      "nova",
      { api: { httpRequest }, errorMessage: "fail" },
    );
    assert.equal(httpRequest.mock.calls.length, 1);
    const [endpoint, method, body, message] = httpRequest.mock.calls[0].arguments;
    assert.equal(endpoint, "/ai/fill_template");
    assert.equal(method, "POST");
    assert.deepEqual(JSON.parse(body), { cv_data: { name: "Anna" }, template_id: "nova" });
    assert.equal(message, "fail");
    assert.deepEqual(result.elements, [{ element_id: "a" }]);
  });

  it("includes spacing_px when spacing is provided", async () => {
    const httpRequest = mock.fn(async () => ({ elements: [] }));
    await fillTemplate(
      { name: "Anna" },
      "nova",
      { api: { httpRequest }, spacing: { section: 40 } },
    );
    const body = JSON.parse(httpRequest.mock.calls[0].arguments[2]);
    assert.equal(body.spacing_px.section, 40);
    assert.equal(body.spacing_px.stack, 4);
  });

  it("rejects missing cv data", async () => {
    await assert.rejects(
      () => fillTemplate(null, "nova", { api: { httpRequest: async () => ({}) } }),
      /Brak danych CV/,
    );
  });
});
