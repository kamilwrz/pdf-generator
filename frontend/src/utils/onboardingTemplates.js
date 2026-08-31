/**
 * Default template used when the guided wizard generates its first Free CV.
 *
 * Keep the identifier in one place because the wizard can finish either in an
 * authenticated modal or after the guest registration handoff. Existing saved
 * documents retain their own template id and are never migrated by this value.
 */
export const FREE_WIZARD_TEMPLATE_ID = "meridian";
