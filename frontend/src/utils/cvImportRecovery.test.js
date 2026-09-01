import assert from "node:assert/strict";
import test from "node:test";

import { cvImportRecoveryMessage } from "./cvImportRequest.js";

test("failed CV imports explain a safe and actionable next step", () => {
    assert.match(cvImportRecoveryMessage("extract_provider_daily_limit"), /odnowieniu limitu/);
    assert.match(cvImportRecoveryMessage("extract_provider_invalid_response"), /wyraźniejszym plikiem/);
    assert.match(cvImportRecoveryMessage("extract_provider_timeout"), /Rozpocznij nowy import/);
    assert.match(cvImportRecoveryMessage("extraction_failed"), /Rozpocznij nowy import/);
    assert.doesNotMatch(cvImportRecoveryMessage("cloudflare_not_configured"), /Cloudflare|provider/i);
});
