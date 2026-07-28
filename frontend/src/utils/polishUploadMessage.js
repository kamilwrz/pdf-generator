/**
 * Polish noun form for "obraz".
 * - nominative: 1 obraz / 2–4 obrazy / 5+ obrazów  (Przesłano N …)
 * - genitive:   1 obrazu / 2+ obrazów              (przesłać N …, Przesyłanie N …)
 */
export function polishObrazWord(n, grammaticalCase = "nominative") {
  const count = Math.abs(Number(n)) || 0;
  if (grammaticalCase === "genitive") {
    return count === 1 ? "obrazu" : "obrazów";
  }
  if (count === 1) return "obraz";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "obrazy";
  return "obrazów";
}

/** Status line while a batch is still uploading. */
export function polishUploadingMessage(total) {
  if (total <= 1) return "Przesyłanie obrazu…";
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
    if (succeeded === 1) return "Przesłano 1 obraz.";
    return `Przesłano ${succeeded} ${polishObrazWord(succeeded)}.`;
  }
  if (succeeded === 0) {
    if (attempted === 1) return "Nie udało się przesłać obrazu.";
    return `Nie udało się przesłać ${attempted} ${polishObrazWord(attempted, "genitive")}.`;
  }
  return `Przesłano ${succeeded} z ${attempted} ${polishObrazWord(attempted, "genitive")}.`;
}
