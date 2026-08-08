import assert from "node:assert/strict";
import test from "node:test";
import {
    availableExtraContactKinds,
    categorizeContactUrl,
    contactDisplayLabel,
} from "./contactLinks.js";

test("categorizes contact URLs by domain", () => {
    assert.equal(categorizeContactUrl("https://linkedin.com/in/a"), "linkedin");
    assert.equal(categorizeContactUrl("github.com/a"), "github");
    assert.equal(categorizeContactUrl("https://anna.dev"), "website");
});

test("builds short display labels", () => {
    assert.equal(
        contactDisplayLabel("linkedin", "https://www.linkedin.com/in/anna"),
        "linkedin.com/in/anna",
    );
    assert.equal(contactDisplayLabel("github", "anna"), "github.com/anna");
});

test("lists only missing optional link kinds", () => {
    assert.deepEqual(
        availableExtraContactKinds({ github: "", website: "" }).map((o) => o.kind),
        ["github", "website"],
    );
    assert.deepEqual(
        availableExtraContactKinds({ github: "github.com/a", website: "" }).map((o) => o.kind),
        ["website"],
    );
    assert.deepEqual(
        availableExtraContactKinds({ github: "g", website: "w" }),
        [],
    );
});
