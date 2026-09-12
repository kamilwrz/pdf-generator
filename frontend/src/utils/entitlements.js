import { t as uiText } from "../i18n/index.js";
/** Helpers for plan entitlements returned by GET /auth/me/entitlements */

export function isTemplateAllowed(template, entitlements) {
    if (!template) return false;
    if (!entitlements) {
        // Before entitlements load, only show free-tier templates.
        return template.tier === "free";
    }
    if (entitlements.template_tier === "all" || entitlements.allowed_template_ids == null) {
        return true;
    }
    return entitlements.allowed_template_ids.includes(template.id);
}

export function planErrorMessage(error, fallback = uiText("editor:entitlements.yourPlanAllowanceHasBeenReached")) {
    if (!error) return fallback;
    if (error.planMessage) return error.planMessage;
    if (typeof error.message === "string" && error.message) return error.message;
    return fallback;
}
