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

/**
 * Canonical channel order. This is the full set of channels the intake wizard
 * supports, in the same sequence the generators place them (phone, email, then
 * socials linkedin/github/website, then location — see `_contact_channel_items`
 * / `contact_social_items` on the backend).
 *
 * The inline contact-channel manager keys its add-menu, chip sorting, and
 * insertion order off THIS list rather than the band descriptor's persisted
 * `order`. The descriptor only records the channels that were present when the
 * CV was generated, so keying off it hid channels the user never filled in
 * (typically GitHub and website) from the `+` menu — even though the wizard
 * offers them. Using the canonical order makes the template's `+` menu offer the
 * same channels the wizard does, and it also works for documents saved before
 * this change (whose descriptor still carries the shorter, generation-time list).
 *
 * The order matches the generator sequence, so treating it as authoritative does
 * not reorder any chips already on the canvas.
 */
export const CHANNEL_ORDER = ["phone", "email", "linkedin", "github", "website", "location"];

/** Display name for a channel, falling back to the raw key when unknown. */
export function channelName(channel) {
  return CHANNEL_NAMES[channel] || channel;
}
