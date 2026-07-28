import assert from "node:assert/strict";
import {
  polishObrazWord,
  polishUploadResultMessage,
  polishUploadingMessage,
} from "./polishUploadMessage.js";

assert.equal(polishObrazWord(1), "obraz");
assert.equal(polishObrazWord(2), "obrazy");
assert.equal(polishObrazWord(4), "obrazy");
assert.equal(polishObrazWord(5), "obrazów");
assert.equal(polishObrazWord(12), "obrazów");
assert.equal(polishObrazWord(22), "obrazy");
assert.equal(polishObrazWord(1, "genitive"), "obrazu");
assert.equal(polishObrazWord(3, "genitive"), "obrazów");

assert.equal(polishUploadingMessage(1), "Przesyłanie obrazu…");
assert.equal(polishUploadingMessage(3), "Przesyłanie 3 obrazów…");
assert.equal(polishUploadingMessage(5), "Przesyłanie 5 obrazów…");

assert.equal(polishUploadResultMessage(1, 1), "Przesłano 1 obraz.");
assert.equal(polishUploadResultMessage(2, 2), "Przesłano 2 obrazy.");
assert.equal(polishUploadResultMessage(5, 5), "Przesłano 5 obrazów.");
assert.equal(polishUploadResultMessage(0, 1), "Nie udało się przesłać obrazu.");
assert.equal(polishUploadResultMessage(0, 3), "Nie udało się przesłać 3 obrazów.");
assert.equal(polishUploadResultMessage(2, 3), "Przesłano 2 z 3 obrazów.");
