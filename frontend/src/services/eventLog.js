import { ApiClient, ENDPOINTS } from "./api";

// Fire-and-forget product-metrics logging. Never awaited by callers, never
// allowed to surface an error — a logging failure must not block or delay
// the user action it's measuring.
export function logEvent(eventType, templateId) {
    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
    api.httpRequest(
        ENDPOINTS.EVENTS.LOG,
        "POST",
        JSON.stringify({ event_type: eventType, template_id: templateId ?? null }),
        "Nie udało się zapisać zdarzenia"
    ).catch(() => {});
}
