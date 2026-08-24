import assert from "node:assert/strict";
import test from "node:test";

import { mergeToastQueue, toastReplaceKey } from "./useToasts.js";

test("replaces an older toast from the same workflow", () => {
  const previous = [
    { id: 1, title: "Szablon zmieniony", templateName: "Slate", replaceKey: "template-change" },
    { id: 2, title: "PDF gotowy" },
  ];
  const next = { id: 3, title: "Szablon zmieniony", templateName: "Portico", replaceKey: "template-change" };

  assert.deepEqual(mergeToastQueue(previous, next), [previous[1], next]);
});

test("keeps unrelated notifications and applies the queue limit", () => {
  const previous = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const next = { id: 4 };

  assert.deepEqual(mergeToastQueue(previous, next), [{ id: 2 }, { id: 3 }, next]);
});

test("derives a replacement category for every toast kind", () => {
  assert.equal(
    toastReplaceKey({ variant: "success", title: "Twoje CV jest dość długie" }),
    "toast:success:Twoje CV jest dość długie",
  );
  assert.equal(toastReplaceKey({ variant: "error", title: "Błąd" }), "toast:error:Błąd");
  assert.equal(toastReplaceKey({ replaceKey: "template-change", title: "X" }), "template-change");
});
