import { templatePreviewPath } from '../../../i18n/templatePreviews.js';
import { useMessageState, messageRef } from '../../../i18n/messageState.js';
import { editorHint } from '../../../i18n/editorHints.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Shared template and optional starter settings. The onboarding host owns submission and persistence. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiCheck, FiChevronDown, FiImage, FiLock, FiSliders, FiLayout } from "react-icons/fi";
import { TEMPLATES } from "../../../templates";
import { isTemplateAllowed } from "../../../utils/entitlements";
import {
  starterSectionLabel,
  PHOTO_TEMPLATE_IDS,
  STARTER_CONTACTS,
  STARTER_TEMPLATE_ID,
} from "../../../utils/cvStarter.js";
import classes from "./CvSetupOptions.module.css";

// Put the starting choice and other Free layouts above the fold, especially
// on phones. Keep this order stable when account entitlements arrive.
const templatePriority = (template) => template.id === STARTER_TEMPLATE_ID ? 0 : template.tier === "free" ? 1 : 2;
const SETUP_TEMPLATES = [...TEMPLATES].sort((left, right) => templatePriority(left) - templatePriority(right));

/** Reserve A4 geometry during loading/failure without blocking template choice. */
function TemplateImage({ template, preview = false }) {
  useTranslation();
  const [state, setState] = useState("loading");
  return <span className={classes.imageFrame} data-state={state}>
    {state === "error" ? <span className={classes.imageFallback}>{preview ? uiText("editor:newCvSetupModal.previewUnavailable") : <FiImage aria-hidden="true" />}</span> : <img
      src={templatePreviewPath(template.id)}
      alt={preview ? uiText("editor:newCvSetupModal.sampleOfTheTemplate", { value0: (template.name) }) : ""}
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />}
  </span>;
}

function moveItem(items, index, direction) {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export default function CvSetupOptions({ config, setConfig, entitlements, submitting = false, imported = false, sectionError = '' }) {
  useTranslation();
  const [moreTemplates, setMoreTemplates] = useState(false);
  const [customizationVisible, setCustomizationOpen] = useState(false);
  const [chosenSettingsView, setSettingsView] = useState("contact");
  const customizationOpen = Boolean(sectionError) || customizationVisible;
  const settingsView = sectionError ? "sections" : chosenSettingsView;
  const [linksOpen, setLinksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customError, setCustomError] = useMessageState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const [status, setStatus] = useMessageState("");
  const customInputId = useId();
  const sectionHeadingRef = useRef(null);
  const customInputRef = useRef(null);
  const templateGridRef = useRef(null);
  const previousTemplatesOpenRef = useRef(true);
  // Only an explicit gallery expansion moves focus. Changing the selection or
  // receiving account entitlements must not steal focus from the active control.
  useEffect(() => {
    const galleryVisible = !customizationOpen;
    if (galleryVisible && !previousTemplatesOpenRef.current) {
      templateGridRef.current?.querySelector("input:checked")?.focus();
    }
    previousTemplatesOpenRef.current = galleryVisible;
  }, [customizationOpen]);

  // Validation can originate from the persistent action while settings are
  // collapsed. Reveal the section choices before moving focus to their error.
  useEffect(() => {
    if (sectionError) sectionHeadingRef.current?.focus();
  }, [sectionError]);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === config.templateId) || TEMPLATES[0],
    [config.templateId],
  );
  const photoSupported = PHOTO_TEMPLATE_IDS.has(selectedTemplate.id);
  const selectedSectionCount = config.sections.filter((section) => section.selected).length;

  // Native radio inputs provide one Tab stop and arrow-key selection, including
  // skipping unavailable Pro templates, without a second custom keyboard model.

  function selectTemplate(template) {
    if (!isTemplateAllowed(template, entitlements)) return;
    const disablesPhoto = config.includePhoto && !PHOTO_TEMPLATE_IDS.has(template.id);
    setConfig((current) => ({
      ...current,
      templateId: template.id,
      includePhoto: disablesPhoto ? false : current.includePhoto,
    }));
    setStatus(disablesPhoto
      ? messageRef("editor:newCvSetupModal.doesNotSupportAPhotoTheOption", { value0: (template.name) })
      : messageRef("editor:newCvSetupModal.selectedTemplate", { value0: (template.name) }));
  }

  function toggleContact(key) {
    setConfig((current) => ({
      ...current,
      contacts: current.contacts.map((item) => (
        item.key === key ? { ...item, selected: !item.selected } : item
      )),
    }));
  }

  function toggleSection(key) {
    setConfig((current) => ({
      ...current,
      sections: current.sections.map((item) => (
        item.key === key ? { ...item, selected: !item.selected } : item
      )),
    }));
  }

  function reorder(key, direction) {
    setConfig((current) => {
      const index = current.sections.findIndex((item) => item.key === key);
      if (index < 0) return current;
      const sections = moveItem(current.sections, index, direction);
      const moved = sections.find((item) => item.key === key);
      setStatus(messageRef("editor:newCvSetupModal.position", { label: moved.label, position: sections.indexOf(moved) + 1, total: sections.length }));
      return { ...current, sections };
    });
  }

  function dropBefore(targetKey) {
    if (!draggedKey || draggedKey === targetKey) return;
    setConfig((current) => {
      const sourceIndex = current.sections.findIndex((item) => item.key === draggedKey);
      const targetIndex = current.sections.findIndex((item) => item.key === targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const sections = [...current.sections];
      const [moved] = sections.splice(sourceIndex, 1);
      sections.splice(targetIndex, 0, moved);
      setStatus(messageRef("editor:newCvSetupModal.position", { label: moved.label, position: sections.indexOf(moved) + 1, total: sections.length }));
      return { ...current, sections };
    });
    setDraggedKey(null);
    setDropKey(null);
  }

  function addCustomSection() {
    const label = customTitle.trim();
    if (!label) return;
    const duplicate = config.sections.some((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate) {
      setCustomError(messageRef("editor:newCvSetupModal.aSectionWithThisNameAlreadyExists"));
      customInputRef.current?.focus();
      return;
    }
    const key = `custom-${Date.now()}-${config.sections.length}`;
    setConfig((current) => ({
      ...current,
      sections: [...current.sections, { key, label, selected: true, custom: true }],
    }));
    setCustomTitle("");
    setCustomError("");
    setStatus(messageRef("editor:newCvSetupModal.sectionAdded", { value0: (label) }));
    customInputRef.current?.focus();
  }

  return (
        <div className={classes.workspace} data-preview-open={previewOpen} data-settings={customizationOpen ? settingsView : undefined}>
          <div className={classes.layout} aria-busy={submitting}>
          <fieldset className={classes.content} disabled={submitting}>
          <legend className={classes.liveStatus}>{uiText("editor:newCvSetupModal.cvSetupOptions")}</legend>
          <div className={classes.setupToolbar}>
          <div className={classes.viewNavigation} aria-label={uiText("editor:newCvSetupModal.setupView")}>
            <button type="button" aria-pressed={!customizationOpen} onClick={() => { setCustomizationOpen(false); setPreviewOpen(false); }}><FiLayout aria-hidden="true" />{uiText("public:siteLayout.templates")}</button>
            {!imported && <button type="button" aria-label={uiText("editor:newCvSetupModal.customiseContent")} aria-expanded={customizationOpen} aria-controls={`${customInputId}-customization`} onClick={() => { setCustomizationOpen((current) => !current); setPreviewOpen(false); }}><FiSliders aria-hidden="true" />{uiText("editor:newCvSetupModal.customiseContent")}</button>}
          </div>
          {!imported && <label className={classes.documentLanguage}>{uiText('common:documentLanguage')}
            <select value={config.language} onChange={(event) => setConfig((current) => ({
              ...current, language: event.target.value,
              sections: current.sections.map((section) => section.custom ? section : ({
                ...section, label: starterSectionLabel(section.key, event.target.value),
              })),
            }))}>
              <option value="pl">{uiText("ai:aiAssistant.polish")}</option><option value="en">English</option>
            </select>
          </label>}
          </div>
          <section className={classes.templates} aria-label={uiText("editor:newCvSetupModal.cvTemplate")} hidden={customizationOpen}>
            {!customizationOpen && <div id={`${customInputId}-templates`}>
            <div ref={templateGridRef} className={classes.templateGrid} data-expanded={moreTemplates || selectedTemplate.tier !== "free"} role="radiogroup" aria-label={uiText("editor:newCvSetupModal.cvTemplate")}>
              {SETUP_TEMPLATES.filter((template) => moreTemplates || template.tier === "free" || template.id === config.templateId).map((template) => {
                const selected = template.id === config.templateId;
                const locked = !isTemplateAllowed(template, entitlements);
                return (
                  <label
                    key={template.id}
                    className={`${classes.templateCard} ${selected ? classes.templateSelected : ""} ${locked ? classes.templateLocked : ""}`}
                  >
                    <input type="radio" name={`template-${customInputId}`} checked={selected} disabled={locked} onChange={() => selectTemplate(template)} data-template-selected={selected ? "true" : undefined} aria-label={`${template.name}, ${locked ? uiText("editor:templateRequiresPro") : template.tier === "free" ? "Free" : "Pro"}, ${template.layouts?.includes("sidebar") ? uiText("editor:templateTwoColumns") : uiText("editor:templateOneColumn")}`} />
                    <span className={classes.templateImage}><TemplateImage key={template.id} template={template} /></span>
                    <span className={classes.templateCopy}>
                      <span className={classes.templateName}>{template.name}<span className={classes.templateTier}>{locked ? "Pro" : template.tier === "free" ? uiText("editor:newCvSetupModal.free") : "Pro"}</span></span>
                      <span className={classes.templateMeta}>{template.layouts?.includes("sidebar") ? uiText("editor:newCvSetupModal.twoColumns") : uiText("editor:newCvSetupModal.oneColumn")}{!moreTemplates && (PHOTO_TEMPLATE_IDS.has(template.id) ? uiText("editor:newCvSetupModal.optionalPhoto") : uiText("editor:newCvSetupModal.noPhoto"))}</span>
                    </span>
                    <span className={classes.selectionMark}>{selected ? <FiCheck aria-hidden="true" /> : locked ? <FiLock aria-hidden="true" /> : null}</span>
                  </label>
                );
              })}
            </div>
            <button type="button" className={classes.textButton} aria-expanded={moreTemplates} onClick={() => setMoreTemplates((current) => !current)}>{moreTemplates ? uiText("editor:newCvSetupModal.showFewerTemplates") : uiText("editor:newCvSetupModal.moreTemplates")}</button>
            </div>}
          </section>

            {customizationOpen && <div id={`${customInputId}-customization`}>
            <div className={classes.settingsNavigation} aria-label={uiText("editor:newCvSetupModal.contentSettings")}>
              <button type="button" aria-pressed={settingsView === "contact"} onClick={() => setSettingsView("contact")}>{uiText("editor:newCvSetupModal.headerAndContact")}</button>
              <button type="button" aria-pressed={settingsView === "sections"} onClick={() => setSettingsView("sections")}>{uiText("interview:factEditor.cvSections")} <span>{selectedSectionCount}</span></button>
            </div>

            {settingsView === "contact" && <section className={classes.optionSection} aria-labelledby="new-cv-contact-heading">
              <div className={classes.sectionHeading}>
                <h3 id="new-cv-contact-heading">{uiText("editor:newCvSetupModal.headerAndContact")}</h3>
                <p>{uiText("editor:newCvSetupModal.yourFullNameIsAlwaysIncludedOther")}</p>
              </div>
              <div className={classes.checkGrid}>
                <label className={classes.checkItem}><input type="checkbox" checked={config.includeTitle} onChange={() => setConfig((current) => ({ ...current, includeTitle: !current.includeTitle }))} /><span>{uiText("editor:newCvSetupModal.professionalTitle")}</span></label>
                {STARTER_CONTACTS.filter((contact) => contact.defaultSelected).map((contact) => (
                  <label key={contact.key} className={classes.checkItem}>
                    <input type="checkbox" checked={config.contacts.find((item) => item.key === contact.key)?.selected || false} onChange={() => toggleContact(contact.key)} />
                    <span>{editorHint(contact.label)}</span>
                  </label>
                ))}
                {photoSupported && <label className={classes.checkItem}>
                  <input type="checkbox" checked={config.includePhoto} onChange={() => setConfig((current) => ({ ...current, includePhoto: !current.includePhoto }))} />
                  <span>{uiText("editor:editor.photo2")}</span>
                </label>}
              </div>
              <button type="button" className={classes.textButton} aria-expanded={linksOpen} aria-controls={`${customInputId}-links`} onClick={() => setLinksOpen((current) => !current)}>{uiText("editor:newCvSetupModal.addLinks")}</button>
              {linksOpen && <div id={`${customInputId}-links`} className={classes.checkGrid}>
                {STARTER_CONTACTS.filter((contact) => !contact.defaultSelected).map((contact) => <label key={contact.key} className={classes.checkItem}>
                  <input type="checkbox" checked={config.contacts.find((item) => item.key === contact.key)?.selected || false} onChange={() => toggleContact(contact.key)} />
                  <span>{editorHint(contact.label)}</span>
                </label>)}
              </div>}
            </section>}

            {settingsView === "sections" && <section className={classes.optionSection} aria-labelledby="new-cv-sections-heading">
              <div className={classes.sectionHeading}>
                <h3 className={sectionError ? undefined : classes.liveStatus} ref={sectionHeadingRef} tabIndex={-1} id="new-cv-sections-heading" aria-describedby={sectionError ? `${customInputId}-sections-error` : undefined}>{uiText("interview:factEditor.cvSections")}</h3>
                <p>{uiText("editor:newCvSetupModal.selectSectionsUseArrowsOrDragTo")}</p>
                {selectedTemplate.layouts?.includes("sidebar") && <p>{uiText("editor:newCvSetupModal.orderChangesSeparatelyWithinEachColumn")}</p>}
                {sectionError && <p id={`${customInputId}-sections-error`} className={classes.fieldError} role="alert">{sectionError}</p>}
              </div>
              <ol className={classes.sectionList}>
                {config.sections.map((section, index) => (
                  <li
                    key={section.key}
                    className={`${classes.sectionRow} ${draggedKey === section.key ? classes.dragging : ""} ${dropKey === section.key ? classes.dropTarget : ""}`}
                    draggable={!submitting}
                    onDragStart={() => setDraggedKey(section.key)}
                    onDragOver={(event) => { event.preventDefault(); if (draggedKey !== section.key) setDropKey(section.key); }}
                    onDragLeave={() => setDropKey(null)}
                    onDrop={() => dropBefore(section.key)}
                    onDragEnd={() => { setDraggedKey(null); setDropKey(null); }}
                  >
                    <label><span className={classes.sectionNumber} aria-hidden="true">{index + 1}</span><input type="checkbox" checked={section.selected} onChange={() => toggleSection(section.key)} /><span>{section.label}</span></label>
                    <div className={classes.reorderButtons}>
                      <button type="button" onClick={() => reorder(section.key, "up")} disabled={index === 0} aria-label={uiText("editor:newCvSetupModal.moveUp", { value0: (section.label) })}><FiArrowUp aria-hidden="true" /></button>
                      <button type="button" onClick={() => reorder(section.key, "down")} disabled={index === config.sections.length - 1} aria-label={uiText("editor:newCvSetupModal.moveDown", { value0: (section.label) })}><FiArrowDown aria-hidden="true" /></button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={classes.customSection}>
                <label htmlFor={customInputId}>{uiText("editor:newCvSetupModal.customSection")} <span>{uiText("ai:aiAssistant.optional")}</span></label>
                <div><input ref={customInputRef} id={customInputId} value={customTitle} aria-invalid={Boolean(customError)} aria-describedby={customError ? `${customInputId}-error` : undefined} onChange={(event) => { setCustomTitle(event.target.value); setCustomError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomSection(); } }} placeholder={uiText("editor:newCvSetupModal.eGConferences")} /><button type="button" onClick={addCustomSection} disabled={!customTitle.trim()}>{uiText("editor:skillsEntryActions.add")}</button></div>
                {customError && <p id={`${customInputId}-error`} className={classes.fieldError} role="alert">{customError}</p>}
              </div>
            </section>}
            {settingsView === "contact" && <p className={classes.configurationSummary}>{uiText("editor:newCvSetupModal.selectedSections")} {selectedSectionCount} {uiText("editor:newCvSetupModal.photo")} {uiText(config.includePhoto ? "common:yes" : "common:no")}{uiText("editor:newCvSetupModal.youCanAlsoChangeFieldsAndSections")}</p>}
            </div>}
          </fieldset>
          <aside className={classes.preview} aria-label={uiText("editor:newCvSetupModal.templatePreview")}>
            <button type="button" className={`${classes.disclosureButton} ${classes.previewToggle}`} aria-expanded={previewOpen} aria-controls={`${customInputId}-preview`} onClick={() => setPreviewOpen((current) => !current)} disabled={submitting}>{uiText("editor:newCvSetupModal.templatePreview")} <FiChevronDown aria-hidden="true" /></button>
            <div id={`${customInputId}-preview`} className={classes.previewBody} data-expanded={previewOpen}>
            <div className={classes.previewHeading}><span className={classes.eyebrow}>{uiText("editor:newCvSetupModal.templatePreview")}</span><span>A4 · 210 × 297 mm</span></div>
            <figure><TemplateImage key={selectedTemplate.id} template={selectedTemplate} preview /><figcaption>{uiText("editor:newCvSetupModal.sampleCv")} {selectedTemplate.name}<br />{uiText("editor:newCvSetupModal.thisIsSampleDataNotYourCv")}</figcaption></figure>
            </div>
          </aside>
          </div>
          <p className={classes.liveStatus} aria-live="polite">{status}</p>
        </div>
  );
}
