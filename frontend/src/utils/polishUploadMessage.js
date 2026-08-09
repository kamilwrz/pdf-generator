/**
 * Polish noun forms for profile-photo upload status lines.
 * - nominative: 1 zdjęcie profilowe / 2–4 zdjęcia profilowe / 5+ zdjęć profilowych
 * - genitive:   1 zdjęcia profilowego / 2+ zdjęć profilowych
 */
export function polishObrazWord(n, grammaticalCase = "nominative") {
  const count = Math.abs(Number(n)) || 0;
  if (grammaticalCase === "genitive") {
    return count === 1 ? "zdjęcia profilowego" : "zdjęć profilowych";
  }
  if (count === 1) return "zdjęcie profilowe";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return "zdjęcia profilowe";
  }
  return "zdjęć profilowych";
}

/** Status line while a batch is still uploading. */
export function polishUploadingMessage(total) {
  if (total <= 1) return "Przesyłanie zdjęcia profilowego…";
  return `Przesyłanie ${total} ${polishObrazWord(total, "genitive")}…`;
}

/**
 * Final batch result. `ok` = successful uploads, `total` = attempted files.
 */
export function polishUploadResultMessage(ok, total) {
  const succeeded = Math.max(0, Number(ok) || 0);
  const attempted = Math.max(0, Number(total) || 0);

  if (attempted === 0) return "";
  if (succeeded === attempted) {
    if (succeeded === 1) return "Przesłano 1 zdjęcie profilowe.";
    return `Przesłano ${succeeded} ${polishObrazWord(succeeded)}.`;
  }
  if (succeeded === 0) {
    if (attempted === 1) return "Nie udało się przesłać zdjęcia profilowego.";
    return `Nie udało się przesłać ${attempted} ${polishObrazWord(attempted, "genitive")}.`;
  }
  return `Przesłano ${succeeded} z ${attempted} ${polishObrazWord(attempted, "genitive")}.`;
}
