/**
 * Starts an editable CV from template defaults, with optional configuration.
 * Choices survive collapsed controls and failed creation. The shared shell owns
 * modality; this component owns disclosures and document replacement consent.
 *
 * Product-owned sample content may opt into replacement without confirmation.
 * This keeps the demo-to-editor transition direct while preserving the guard
 * for saved and unsaved documents that belong to the user.
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiCheck, FiChevronDown, FiMenu } from "react-icons/fi";
import DialogShell from "../../common/DialogShell/DialogShell";
import { TEMPLATES } from "../../../templates";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { resolveFreeStartTemplate } from "../../../utils/cvTemplateSelection";
import {
  createDefaultStarterConfig,
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
  const [state, setState] = useState("loading");
  return <span className={classes.imageFrame} data-state={state}>
    {state === "error" ? <span className={classes.imageFallback}>Podgląd niedostępny</span> : <img
      src={`/template-mockups/${template.id}.png`}
      alt={preview ? `Przykładowy wygląd szablonu ${template.name}` : ""}
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
  allowUnconfirmedReplacement = false,
  initialTemplateId = null,
  autoStart = false,
}) {
  // Read the landing hint once per setup session. Late account updates and
  // rerenders must never overwrite choices made inside the configuration.
  const [initialTemplate] = useState(() => resolveFreeStartTemplate(TEMPLATES, initialTemplateId));
  const [config, setConfig] = useState(() => ({
    ...createDefaultStarterConfig(),
    ...(initialTemplate ? { templateId: initialTemplate.id } : {}),
  }));
  const [confirmReplacement, setConfirmReplacement] = useState(hasActiveDocument);
  const [templatesOpen, setTemplatesOpen] = useState(!initialTemplate);
  const [moreTemplates, setMoreTemplates] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customError, setCustomError] = useState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sectionError, setSectionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const customInputId = useId();
  const sectionHeadingRef = useRef(null);
  const customInputRef = useRef(null);
  const templateGridRef = useRef(null);
  const previousTemplatesOpenRef = useRef(templatesOpen);
  const submittingRef = useRef(false);
  const autoStartedRef = useRef(false);

  // Only an explicit gallery expansion moves focus. Changing the selection or
  // receiving account entitlements must not steal focus from the active control.
  useEffect(() => {
    if (templatesOpen && !previousTemplatesOpenRef.current) {
      templateGridRef.current?.querySelector("input:checked")?.focus();
    }
    previousTemplatesOpenRef.current = templatesOpen;
  }, [templatesOpen]);

  // Validation can originate from the persistent action while settings are
  // collapsed. Reveal the section choices before moving focus to their error.
  useEffect(() => {
    if (sectionError && customizationOpen) sectionHeadingRef.current?.focus();
  }, [sectionError, customizationOpen]);

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
      ? `${template.name} nie obsługuje zdjęcia. Opcja została wyłączona.`
      : `Wybrano szablon ${template.name}.`);
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
      setStatus(`${moved.label}: pozycja ${sections.indexOf(moved) + 1} z ${sections.length}.`);
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
      setStatus(`${moved.label}: pozycja ${sections.indexOf(moved) + 1} z ${sections.length}.`);
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
      setCustomError("Sekcja o tej nazwie już istnieje. Wpisz inną nazwę.");
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
    setStatus(`Dodano sekcję ${label}.`);
    customInputRef.current?.focus();
  }

  async function submit() {
    if (submittingRef.current) return;
    if (!config.sections.some((item) => item.selected)) {
      setSectionError("Wybierz co najmniej jedną sekcję CV.");
      setCustomizationOpen(true);
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
      else setError("Nie utworzono CV. Ustawienia zostały zachowane; możesz spróbować ponownie.");
    } catch (creationError) {
      setError(creationError?.message || "Nie udało się utworzyć nowego CV. Konfiguracja została zachowana.");
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
      <button type="button" className={classes.secondaryButton} onClick={onClose}>Anuluj</button>
      <button data-confirm-new-cv type="button" className={classes.primaryButton} onClick={() => setConfirmReplacement(false)}>
        Utwórz nowe CV
      </button>
    </div>
  ) : (
    <div className={classes.footerBar}>
      <div className={classes.footerFeedback}><p className={classes.footerHint}>Zaczniesz bez konta. Zapis i pobranie PDF wymagają bezpłatnego konta.</p>{error && <p className={classes.error} role="alert">{error}</p>}{submitting && <p className={classes.fieldError} role="status">Tworzenie CV…</p>}</div>
      <div className={classes.footerActions}>
        <button type="button" className={classes.secondaryButton} onClick={onClose} disabled={submitting}>Anuluj</button>
        <button type="button" className={classes.primaryButton} onClick={submit} disabled={submitting}>
          {submitting ? "Tworzenie CV…" : error ? "Spróbuj ponownie" : "Rozpocznij edycję"}
        </button>
      </div>
    </div>
  );

  return (
    <DialogShell
      open={open}
      onClose={submitting ? () => {} : onClose}
      width={560}
      variant={confirmReplacement ? "modal" : "fullscreen"}
      surface="paper"
      title={confirmReplacement ? "Utworzyć nowe CV?" : "Utwórz CV"}
      subtitle={confirmReplacement
        ? "Obecny dokument pozostanie zapisany bez zmian. Nowe CV rozpocznie się jako niezapisany projekt."
        : "Wybierz szablon i uzupełnij swoje dane w edytorze."}
      footer={footer}
      initialFocusSelector={confirmReplacement ? "[data-confirm-new-cv]" : initialTemplate ? "#new-cv-template-heading" : "[data-template-selected='true']"}
    >
      {confirmReplacement ? (
        <div className={classes.confirmation}>
          <p>Wybierz szablon i rozpocznij nowe CV. Poprzedni zapisany projekt nie zostanie nadpisany.</p>
        </div>
      ) : (
        <div className={classes.workspace}>
          <div className={classes.layout} aria-busy={submitting}>
          <fieldset className={classes.content} disabled={submitting}>
          <legend className={classes.liveStatus}>Opcje konfiguracji CV</legend>
          <section className={classes.templates} aria-labelledby="new-cv-template-heading">
            <div className={classes.sectionHeading}>
              <h3 tabIndex={-1} id="new-cv-template-heading">Wybrany szablon: {selectedTemplate.name}</h3>
              {initialTemplate && <button type="button" className={classes.textButton} aria-expanded={templatesOpen} aria-controls={`${customInputId}-templates`} onClick={() => setTemplatesOpen((current) => !current)}>{templatesOpen ? "Zwiń wybór szablonu" : "Zmień szablon"}</button>}
            </div>
            {templatesOpen && <div id={`${customInputId}-templates`}>
            <div ref={templateGridRef} className={classes.templateGrid} role="radiogroup" aria-label="Szablon CV">
              {SETUP_TEMPLATES.filter((template) => moreTemplates || template.tier === "free" || template.id === config.templateId).map((template) => {
                const selected = template.id === config.templateId;
                const locked = !isTemplateAllowed(template, entitlements);
                return (
                  <label
                    key={template.id}
                    className={`${classes.templateCard} ${selected ? classes.templateSelected : ""} ${locked ? classes.templateLocked : ""}`}
                  >
                    <input type="radio" name={`template-${customInputId}`} checked={selected} disabled={locked} onChange={() => selectTemplate(template)} data-template-selected={selected ? "true" : undefined} aria-label={`${template.name}, ${locked ? "wymaga Pro" : template.tier === "free" ? "Free" : "Pro"}, ${template.layouts?.includes("sidebar") ? "2 kolumny" : "1 kolumna"}`} />
                    <span className={classes.templateImage}><TemplateImage key={template.id} template={template} /></span>
                    <span className={classes.templateName}>{template.name}{selected && <FiCheck aria-hidden="true" />}</span>
                    <span className={classes.templateMeta}>{locked ? "Wymaga Pro" : template.tier === "free" ? "Bezpłatny" : "Pro"}{PHOTO_TEMPLATE_IDS.has(template.id) ? " · Opcjonalne zdjęcie" : " · Bez zdjęcia"}</span>
                  </label>
                );
              })}
            </div>
            <button type="button" className={classes.textButton} aria-expanded={moreTemplates} onClick={() => setMoreTemplates((current) => !current)}>{moreTemplates ? "Pokaż mniej szablonów" : "Więcej szablonów"}</button>
            </div>}
          </section>

          <div className={classes.customization}>
            <button type="button" className={classes.disclosureButton} aria-expanded={customizationOpen} aria-controls={`${customInputId}-customization`} onClick={() => setCustomizationOpen((current) => !current)}>Dostosuj zawartość <FiChevronDown aria-hidden="true" /></button>
            {customizationOpen && <div id={`${customInputId}-customization`} className={classes.customizationBody}>

            <section className={classes.optionSection} aria-labelledby="new-cv-contact-heading">
              <div className={classes.sectionHeading}>
                <h3 id="new-cv-contact-heading">Nagłówek i kontakt</h3>
                <p>Imię i nazwisko — zawsze widoczne. Pozostałe pola są opcjonalne.</p>
              </div>
              <div className={classes.checkGrid}>
                <label className={classes.checkItem}><input type="checkbox" checked={config.includeTitle} onChange={() => setConfig((current) => ({ ...current, includeTitle: !current.includeTitle }))} /><span>Tytuł zawodowy</span></label>
                {STARTER_CONTACTS.filter((contact) => contact.defaultSelected).map((contact) => (
                  <label key={contact.key} className={classes.checkItem}>
                    <input type="checkbox" checked={config.contacts.find((item) => item.key === contact.key)?.selected || false} onChange={() => toggleContact(contact.key)} />
                    <span>{contact.label}</span>
                  </label>
                ))}
                {photoSupported && <label className={classes.checkItem}>
                  <input type="checkbox" checked={config.includePhoto} onChange={() => setConfig((current) => ({ ...current, includePhoto: !current.includePhoto }))} />
                  <span>Zdjęcie</span>
                </label>}
              </div>
              <button type="button" className={classes.textButton} aria-expanded={linksOpen} aria-controls={`${customInputId}-links`} onClick={() => setLinksOpen((current) => !current)}>Dodaj linki</button>
              {linksOpen && <div id={`${customInputId}-links`} className={classes.checkGrid}>
                {STARTER_CONTACTS.filter((contact) => !contact.defaultSelected).map((contact) => <label key={contact.key} className={classes.checkItem}>
                  <input type="checkbox" checked={config.contacts.find((item) => item.key === contact.key)?.selected || false} onChange={() => toggleContact(contact.key)} />
                  <span>{contact.label}</span>
                </label>)}
              </div>}
            </section>

            <section className={classes.optionSection} aria-labelledby="new-cv-sections-heading">
              <div className={classes.sectionHeading}>
                <h3 ref={sectionHeadingRef} tabIndex={-1} id="new-cv-sections-heading" aria-describedby={sectionError ? `${customInputId}-sections-error` : undefined}>Sekcje CV</h3>
                <p>Wybierz sekcje. Ich kolejność zmienisz strzałkami lub przeciąganiem.</p>
                {selectedTemplate.layouts?.includes("sidebar") && <p>Kolejność zmienia się osobno w każdej kolumnie.</p>}
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
                    <FiMenu className={classes.dragHandle} aria-hidden="true" />
                    <label><input type="checkbox" checked={section.selected} onChange={() => toggleSection(section.key)} /><span>{section.label}</span></label>
                    <div className={classes.reorderButtons}>
                      <button type="button" onClick={() => reorder(section.key, "up")} disabled={index === 0} aria-label={`Przenieś ${section.label} wyżej`}><FiArrowUp aria-hidden="true" /></button>
                      <button type="button" onClick={() => reorder(section.key, "down")} disabled={index === config.sections.length - 1} aria-label={`Przenieś ${section.label} niżej`}><FiArrowDown aria-hidden="true" /></button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={classes.customSection}>
                <label htmlFor={customInputId}>Własna sekcja <span>(opcjonalnie)</span></label>
                <div><input ref={customInputRef} id={customInputId} value={customTitle} aria-invalid={Boolean(customError)} aria-describedby={customError ? `${customInputId}-error` : undefined} onChange={(event) => { setCustomTitle(event.target.value); setCustomError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomSection(); } }} placeholder="np. Konferencje" /><button type="button" onClick={addCustomSection} disabled={!customTitle.trim()}>Dodaj</button></div>
                {customError && <p id={`${customInputId}-error`} className={classes.fieldError} role="alert">{customError}</p>}
              </div>
            </section>
            <p className={classes.configurationSummary}>Wybrane sekcje: {selectedSectionCount} · Zdjęcie: {config.includePhoto ? "tak" : "nie"}. Pola i sekcje możesz zmieniać także w edytorze.</p>
            </div>}
          </div>
          </fieldset>
          <aside className={classes.preview} aria-label="Podgląd szablonu">
            <button type="button" className={`${classes.disclosureButton} ${classes.previewToggle}`} aria-expanded={previewOpen} aria-controls={`${customInputId}-preview`} onClick={() => setPreviewOpen((current) => !current)} disabled={submitting}>Podgląd szablonu <FiChevronDown aria-hidden="true" /></button>
            <div id={`${customInputId}-preview`} className={classes.previewBody} data-expanded={previewOpen}>
            <h3>{selectedTemplate.name}</h3>
            <figure><TemplateImage key={selectedTemplate.id} template={selectedTemplate} preview /><figcaption>Przykładowe CV</figcaption></figure>
            </div>
          </aside>
          </div>
          <p className={classes.liveStatus} aria-live="polite">{status}</p>
        </div>
      )}
    </DialogShell>
  );
}
