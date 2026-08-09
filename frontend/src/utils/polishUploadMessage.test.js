import assert from "node:assert/strict";
import {
  polishObrazWord,
  polishUploadResultMessage,
  polishUploadingMessage,
} from "./polishUploadMessage.js";

assert.equal(polishObrazWord(1), "zdjęcie profilowe");
assert.equal(polishObrazWord(2), "zdjęcia profilowe");
assert.equal(polishObrazWord(4), "zdjęcia profilowe");
assert.equal(polishObrazWord(5), "zdjęć profilowych");
assert.equal(polishObrazWord(12), "zdjęć profilowych");
assert.equal(polishObrazWord(22), "zdjęcia profilowe");
assert.equal(polishObrazWord(1, "genitive"), "zdjęcia profilowego");
assert.equal(polishObrazWord(3, "genitive"), "zdjęć profilowych");

assert.equal(polishUploadingMessage(1), "Przesyłanie zdjęcia profilowego…");
assert.equal(polishUploadingMessage(3), "Przesyłanie 3 zdjęć profilowych…");
assert.equal(polishUploadingMessage(5), "Przesyłanie 5 zdjęć profilowych…");

assert.equal(polishUploadResultMessage(1, 1), "Przesłano 1 zdjęcie profilowe.");
assert.equal(polishUploadResultMessage(2, 2), "Przesłano 2 zdjęcia profilowe.");
assert.equal(polishUploadResultMessage(5, 5), "Przesłano 5 zdjęć profilowych.");
assert.equal(polishUploadResultMessage(0, 1), "Nie udało się przesłać zdjęcia profilowego.");
assert.equal(polishUploadResultMessage(0, 3), "Nie udało się przesłać 3 zdjęć profilowych.");
assert.equal(polishUploadResultMessage(2, 3), "Przesłano 2 z 3 zdjęć profilowych.");
