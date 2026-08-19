/**
 * Human-readable Polish names for contact channels.
 *
 * Single source shared by the add-channel menu, the placeholder shown in a
 * freshly added (empty) contact label, and any future contact UI, so the
 * wording never drifts between call sites.
 */
export const CHANNEL_NAMES = {
  phone: "Telefon",
  email: "E-mail",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Strona WWW",
  location: "Lokalizacja",
};

/** Display name for a channel, falling back to the raw key when unknown. */
export function channelName(channel) {
  return CHANNEL_NAMES[channel] || channel;
}
