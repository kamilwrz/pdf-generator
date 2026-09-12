import { templatePreviewPath } from '../../../i18n/templatePreviews.js';
import { useMessageState, messageRef } from '../../../i18n/messageState.js';
import { editorHint } from '../../../i18n/editorHints.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import LanguageSelect from '../../common/LanguageSelect/LanguageSelect';
/**
 * Starts an editable CV from template defaults, with optional configuration.
 * Choices survive collapsed controls and failed creation. The shared shell owns
 * modality; this component owns mutually exclusive setup views and replacement
 * consent. View changes never modify the pending document configuration.
 *
 * Product-owned sample content may opt into replacement without confirmation.
 * This keeps the demo-to-editor transition direct while preserving the guard
 * for saved and unsaved documents that belong to the user.
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiArrowRight, FiCheck, FiChevronDown, FiImage, FiLock, FiSliders, FiLayout, FiMessageSquare } from "react-icons/fi";
import DialogShell from "../../common/DialogShell/DialogShell";
import { TEMPLATES } from "../../../templates";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { resolveStartTemplate } from "../../../utils/cvTemplateSelection";
import { Link } from 'react-router-dom';
import { getAccessToken } from '../../../utils/authSession';
import {
  createDefaultStarterConfig,
  starterSectionLabel,
  PHOTO_TEMPLATE_IDS,
  STARTER_CONTACTS,
  STARTER_TEMPLATE_ID,
} from "../../../utils/cvStarter.js";
import classes from "./NewCvSetupModal.module.css";

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

export default function NewCvSetupModal({
  open,
  onClose,
  onCreate,
  entitlements,
  hasActiveDocument = false,
  isGuest = false,
  hasSavedDocument = false,
  allowUnconfirmedReplacement = false,
  initialTemplateId = null,
  autoStart = false,
}) {
  useTranslation();
  // Read the landing hint once per setup session. Late account updates and
  // rerenders must never overwrite choices made inside the configuration.
  const [initialTemplate] = useState(() => resolveStartTemplate(TEMPLATES, initialTemplateId));
  const [config, setConfig] = useState(() => ({
    ...createDefaultStarterConfig(),
    ...(initialTemplate ? { templateId: initialTemplate.id } : {}),
  }));
  const [confirmReplacement, setConfirmReplacement] = useState(hasActiveDocument);
  // A browser draft has one storage slot. Account documents keep only their
  // last server-saved version; neither mode can promise to retain unsaved edits.
  const replacementDescription = isGuest
    ? uiText("editor:newCvSetupModal.thisBrowserStoresOneCvDraftStarting")
    : hasSavedDocument
      ? uiText("editor:newCvSetupModal.theLastSavedVersionWillRemainIn")
      : uiText("editor:newCvSetupModal.theCurrentCvIsNotSavedTo");
  const [templatesOpen, setTemplatesOpen] = useState(!initialTemplate);
  const [moreTemplates, setMoreTemplates] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [settingsView, setSettingsView] = useState("contact");
  const [linksOpen, setLinksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customError, setCustomError] = useMessageState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const [status, setStatus] = useMessageState("");
  const [error, setError] = useMessageState("");
  const [sectionError, setSectionError] = useMessageState("");
  const [submitting, setSubmitting] = useState(false);
  const customInputId = useId();
  const sectionHeadingRef = useRef(null);
  const customInputRef = useRef(null);
  const templateGridRef = useRef(null);
  const previousTemplatesOpenRef = useRef(templatesOpen);
  const submittingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const canInterview = entitlements?.ai_assistant === true;
  const accessResolved = typeof entitlements?.ai_assistant === "boolean";

  // Only an explicit gallery expansion moves focus. Changing the selection or
  // receiving account entitlements must not steal focus from the active control.
  useEffect(() => {
    const galleryVisible = templatesOpen && !customizationOpen;
    if (galleryVisible && !previousTemplatesOpenRef.current) {
      templateGridRef.current?.querySelector("input:checked")?.focus();
    }
    previousTemplatesOpenRef.current = galleryVisible;
  }, [templatesOpen, customizationOpen]);

  // Validation can originate from the persistent action while settings are
  // collapsed. Reveal the section choices before moving focus to their error.
  useEffect(() => {
    if (sectionError && customizationOpen && settingsView === "sections") sectionHeadingRef.current?.focus();
  }, [sectionError, customizationOpen, settingsView]);

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
    setError("");
    setSectionError("");
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
    setError("");
    setSectionError("");
    setStatus(messageRef("editor:newCvSetupModal.sectionAdded", { value0: (label) }));
    customInputRef.current?.focus();
  }

  async function submit() {
    if (submittingRef.current) return;
    if (!isTemplateAllowed(selectedTemplate, entitlements)) {
      setError(messageRef("editor:newCvSetupModal.theSelectedTemplateRequiresActiveProAccess"));
      return;
    }
    if (!config.sections.some((item) => item.selected)) {
      setSectionError(messageRef("editor:newCvSetupModal.chooseAtLeastOneCvSection"));
      setCustomizationOpen(true);
      setSettingsView("sections");
      setPreviewOpen(false);
      return;
    }
    // The ref also rejects a second activation before React commits disabled UI.
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const created = await onCreate(config, {
        replacementConfirmed: hasActiveDocument || allowUnconfirmedReplacement,
      });
      // Completion must stay in the editor; guest dismissal returns to landing.
      if (created !== false) onClose("created");
      else setError(messageRef("editor:newCvSetupModal.theCvWasNotCreatedYourSettings"));
    } catch (creationError) {
      setError(creationError?.message || messageRef("editor:newCvSetupModal.couldNotCreateANewCvYour"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // A first-time guest has already chosen a Free template on the landing.
  // Reuse the normal submission and its recoverable settings/error UI. The
  // ref prevents duplicate creation under StrictMode or changing callbacks.
  const startSelectedTemplate = useEffectEvent(() => { void submit(); });
  useEffect(() => {
    if (!open || !autoStart || !initialTemplate || hasActiveDocument || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startSelectedTemplate();
  }, [open, autoStart, initialTemplate, hasActiveDocument]);

  const footer = confirmReplacement ? (
    <div className={classes.footerActions}>
      <button data-confirm-new-cv type="button" className={classes.secondaryButton} onClick={() => setConfirmReplacement(false)}>{uiText("editor:newCvSetupModal.createANewCv")}</button>
      <button data-resume-cv type="button" className={classes.primaryButton} onClick={onClose}>{uiText("editor:newCvSetupModal.returnToCurrentCv")}</button>
    </div>
  ) : (
    <div className={classes.footerBar}>
      <div className={classes.footerFeedback}><p className={classes.footerHint}>{!isTemplateAllowed(selectedTemplate, entitlements) ? <>{uiText("interview:interviewLoading.template")} {selectedTemplate.name} {uiText("editor:newCvSetupModal.requiresActiveProAccess")} <Link to={getAccessToken() ? `/app/account?template=${selectedTemplate.id}` : `/register?plan=pro&start=new&template=${selectedTemplate.id}`}>{uiText("editor:newCvSetupModal.checkProAccess")}</Link> {uiText("editor:newCvSetupModal.orChooseAFreeTemplate")}</> : getAccessToken() ? uiText("editor:newCvSetupModal.youWillFindTheSavedProjectIn") : uiText("editor:newCvSetupModal.startWithoutAnAccountSavingAndDownloading")}</p>{error && <p className={classes.error} role="alert">{error}</p>}{submitting && <p className={classes.fieldError} role="status">{uiText("editor:newCvSetupModal.creatingCv")}</p>}</div>
      <div className={classes.footerActions}>
        <button type="button" className={classes.secondaryButton} onClick={onClose} disabled={submitting}>{uiText("ai:aiAssistant.cancel")}</button>
        <button type="button" className={classes.primaryButton} onClick={submit} disabled={submitting || !isTemplateAllowed(selectedTemplate, entitlements)}>
          {submitting ? uiText("editor:newCvSetupModal.creatingCv") : error ? uiText("errors:errorBoundary.tryAgain") : uiText("editor:newCvSetupModal.startEditing")}<FiArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <DialogShell
      open={open}
      onClose={submitting ? () => {} : onClose}
      width={560}
      variant={confirmReplacement ? "decision" : "fullscreen"}
      surface="paper"
      title={confirmReplacement ? uiText("editor:newCvSetupModal.createANewCv2") : uiText("ai:aiCvPanel.createCv")}
      headerAction={<><LanguageSelect />{!isGuest && !confirmReplacement ? <Link
        className={classes.interviewEntry}
        to={canInterview ? "/app/interview" : "/app/account"}
        aria-disabled={submitting || undefined}
        tabIndex={submitting ? -1 : undefined}
        onClick={(event) => { if (submittingRef.current) event.preventDefault(); }}
      >
        <FiMessageSquare className={classes.interviewIcon} aria-hidden="true" />
        <span className={classes.interviewCopy}><strong>{uiText("editor:newCvSetupModal.aiInterview")}</strong>{" "}<span>{canInterview ? uiText("editor:newCvSetupModal.startInterview") : accessResolved ? uiText("editor:newCvSetupModal.proOnly") : uiText("editor:newCvSetupModal.checkProAccess")}</span></span>
        <span className={classes.interviewBadge} aria-hidden="true">PRO</span>
        <FiArrowRight className={classes.interviewArrow} aria-hidden="true" />
      </Link> : null}</>}
      subtitle={confirmReplacement
        ? replacementDescription
        : uiText("editor:newCvSetupModal.chooseATemplateAndEnterYourDetails")}
      footer={footer}
      initialFocusSelector={confirmReplacement ? "[data-resume-cv]" : initialTemplate ? "#new-cv-template-heading" : "[data-template-selected='true']"}
    >
      {confirmReplacement ? (
        <div className={classes.confirmation}>
          <p>{uiText("editor:newCvSetupModal.youCanReturnToYourCurrentCv")}</p>
        </div>
      ) : (
        <div className={classes.workspace} data-preview-open={previewOpen} data-settings={customizationOpen ? settingsView : undefined}>
          <div className={classes.layout} aria-busy={submitting}>
          <fieldset className={classes.content} disabled={submitting}>
          <legend className={classes.liveStatus}>{uiText("editor:newCvSetupModal.cvSetupOptions")}</legend>
          <div className={classes.setupToolbar}>
          <div className={classes.viewNavigation} aria-label={uiText("editor:newCvSetupModal.setupView")}>
            <button type="button" aria-pressed={!customizationOpen} onClick={() => { setTemplatesOpen(true); setCustomizationOpen(false); setPreviewOpen(false); }}><FiLayout aria-hidden="true" />{uiText("public:siteLayout.templates")}</button>
            <button type="button" aria-label={uiText("editor:newCvSetupModal.customiseContent")} aria-expanded={customizationOpen} aria-controls={`${customInputId}-customization`} onClick={() => { setCustomizationOpen((current) => !current); setPreviewOpen(false); }}><FiSliders aria-hidden="true" />{uiText("editor:newCvSetupModal.customiseContent")}</button>
          </div>
          <label className={classes.documentLanguage}>{uiText('common:documentLanguage')}
            <select value={config.language} onChange={(event) => setConfig((current) => ({
              ...current, language: event.target.value,
              sections: current.sections.map((section) => section.custom ? section : ({
                ...section, label: starterSectionLabel(section.key, event.target.value),
              })),
            }))}>
              <option value="pl">{uiText("ai:aiAssistant.polish")}</option><option value="en">English</option>
            </select>
          </label>
          </div>
          <section className={classes.templates} aria-labelledby="new-cv-template-heading" hidden={customizationOpen}>
            <div className={`${classes.sectionHeading} ${classes.templateHeading}`}>
              <div><span className={classes.eyebrow}>{uiText("editor:newCvSetupModal.yourTemplate")}</span><h3 tabIndex={-1} id="new-cv-template-heading" aria-label={uiText("editor:newCvSetupModal.selectedTemplate2", { value0: (selectedTemplate.name) })}>{selectedTemplate.name}</h3></div>
              {initialTemplate && !templatesOpen && <button type="button" className={classes.textButton} aria-expanded={false} aria-controls={`${customInputId}-templates`} onClick={() => setTemplatesOpen(true)}>{uiText("editor:newCvSetupModal.changeTemplate")}</button>}
            </div>
            {!customizationOpen && !templatesOpen && <p className={classes.templateDescription}>{selectedTemplate.description}</p>}
            {!customizationOpen && templatesOpen && <div id={`${customInputId}-templates`}>
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
            {!customizationOpen && !moreTemplates && <p className={classes.startHint}>{uiText("editor:newCvSetupModal.chooseAnAppearanceEnterYourDetailsIn")}<br />{uiText("editor:newCvSetupModal.youCanAlsoChangeTheTemplateAnd")}</p>}
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
            {settingsView === "contact" && <p className={classes.configurationSummary}>{uiText("editor:newCvSetupModal.selectedSections")} {selectedSectionCount} {uiText("editor:newCvSetupModal.photo")} {config.includePhoto ? "tak" : "nie"}{uiText("editor:newCvSetupModal.youCanAlsoChangeFieldsAndSections")}</p>}
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
      )}
    </DialogShell>
  );
}
