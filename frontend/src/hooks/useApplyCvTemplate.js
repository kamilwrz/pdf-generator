/**
 * Apply a registry template onto the current CV without starting a new document.
 *
 * Shared by the change-template modal and the topbar prev/next arrows so both
 * paths call `/ai/fill_template` with generator-default spacing and then
 * `replaceActiveElements` (keeps pdfId + title).
 */
import { useCallback, useMemo, useState, use } from "react";
import { PdfContext } from "../store/pdfgenerator-context";
import { ApiClient } from "../services/api";
import { fillTemplate } from "../services/fillTemplate";
import { isTemplateAllowed, planErrorMessage } from "../utils/entitlements";
import { DEFAULT_FLOW_SPACING } from "../utils/flowSpacing";
import { getAccessToken } from "../utils/authSession";

function templateBadgeInk(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return "#FFFFFF";
  const channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
  return luminance > 0.62 ? "#171717" : "#FFFFFF";
}

/**
 * @returns {{
 *   applyTemplate: (template: object) => Promise<boolean>,
 *   fillingId: string|null,
 *   error: string|null,
 *   setError: (value: string|null) => void,
 * }}
 */
export function useApplyCvTemplate() {
  const {
    activeCvData,
    A4_Elements,
    entitlements,
    replaceActiveElements,
    adoptDocumentFlowSpacing,
    pushToast,
  } = use(PdfContext);

  const [fillingId, setFillingId] = useState(null);
  const [error, setError] = useState(null);

  const api = useMemo(() => {
    const token = getAccessToken();
    return new ApiClient(token ? { Authorization: `Bearer ${token}` } : {});
  }, []);

  const applyTemplate = useCallback(async (template) => {
    if (!activeCvData || !template) return false;
    if (!isTemplateAllowed(template, entitlements)) {
      setError("Ten szablon jest dostępny w planie Pro.");
      return false;
    }
    setFillingId(template.id);
    setError(null);
    try {
      // Sections-panel spacing belongs to the current document layout.
      // A new template must regenerate with the generator defaults — not
      // the previous template's custom rhythm knobs.
      const res = await fillTemplate(activeCvData, template.id, {
        api,
        errorMessage: "Zmiana szablonu nie powiodła się",
        spacing: DEFAULT_FLOW_SPACING,
      });
      // No title argument: `replaceActiveElements` only overwrites the
      // title input when one is passed, so the project keeps whatever
      // name the user already gave it.
      // The new template must own all presentation and geometry. User content
      // is already represented by `activeCvData`, including accepted AI edits.
      // Copying fields from the previous canvas here leaks the old template's
      // typography and colours into the target template.
      replaceActiveElements(res.elements, undefined, template.id);
      // Keep knobs / Reset baseline / next autosave `spacing_px` aligned
      // with the freshly generated layout (after pinFlowSpacingBaseline).
      adoptDocumentFlowSpacing?.(DEFAULT_FLOW_SPACING);
      pushToast?.({
        title: "Szablon zmieniony",
        templateName: template.name,
        templateAccent: template.accent,
        templateBadgeInk: templateBadgeInk(template.accent),
        variant: "success",
      });
      return true;
    } catch (err) {
      setError(planErrorMessage(err, "Nie udało się zmienić szablonu."));
      return false;
    } finally {
      setFillingId(null);
    }
  }, [
    activeCvData,
    adoptDocumentFlowSpacing,
    api,
    entitlements,
    pushToast,
    replaceActiveElements,
  ]);

  return { applyTemplate, fillingId, error, setError };
}
