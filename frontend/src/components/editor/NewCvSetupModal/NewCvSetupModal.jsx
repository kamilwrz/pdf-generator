/**
 * Configures a new editable A4 CV in three fullscreen steps, retaining choices
 * across navigation and failed creation. The shared shell owns modality; this
 * component owns step focus, configuration, and user-document replacement consent.
 *
 * Product-owned sample content may opt into replacement without confirmation.
 * This keeps the demo-to-editor transition direct while preserving the guard
 * for saved and unsaved documents that belong to the user.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiCheck, FiMenu } from "react-icons/fi";
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

const STEPS = ["Szablon", "Nagłówek i kontakt", "Sekcje i kolejność"];
const COMPACT_STEPS = ["Szablon", "Kontakt", "Sekcje"];
// Put the starting choice and other Free layouts above the fold, especially
// on phones. Keep this order stable when account entitlements arrive.
const templatePriority = (template) => template.id === STARTER_TEMPLATE_ID ? 0 : template.tier === "free" ? 1 : 2;
const SETUP_TEMPLATES = [...TEMPLATES].sort((left, right) => templatePriority(left) - templatePriority(right));

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
}) {
  // Read the landing hint once per setup session. Late account updates and
  // rerenders must never overwrite choices made inside the configuration.
  const [initialTemplate] = useState(() => resolveFreeStartTemplate(TEMPLATES, initialTemplateId));
  const [config, setConfig] = useState(() => ({
    ...createDefaultStarterConfig(),
    ...(initialTemplate ? { templateId: initialTemplate.id } : {}),
  }));
  const [confirmReplacement, setConfirmReplacement] = useState(hasActiveDocument);
  const [step, setStep] = useState(initialTemplate ? 1 : 0);
  const [customTitle, setCustomTitle] = useState("");
  const [customError, setCustomError] = useState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const customInputId = useId();
  const stepHeadingRef = useRef(null);
  const customInputRef = useRef(null);
  const previousStepRef = useRef(step);

  // Moving between steps preserves configuration but resets reading position.
  // Focus the new heading only on a real step change; the shared shell owns
  // opening focus and restoration to the original editor trigger.
  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    stepHeadingRef.current?.focus({ preventScroll: true });
    stepHeadingRef.current?.closest(`.${classes.workspace}`)?.parentElement?.scrollTo?.(0, 0);
  }, [step]);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === config.templateId) || TEMPLATES[0],
    [config.templateId],
  );
  const photoSupported = PHOTO_TEMPLATE_IDS.has(selectedTemplate.id);
  const selectedSectionCount = config.sections.filter((section) => section.selected).length;

  function navigateStep(nextStep) {
    if (submitting) return;
    setError("");
    setStep(nextStep);
  }

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
    setStatus(`Dodano sekcję ${label}.`);
    customInputRef.current?.focus();
  }

  async function submit() {
    if (submitting) return;
    if (!config.sections.some((item) => item.selected)) {
      setError("Wybierz co najmniej jedną sekcję CV.");
      return;
    }
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
      setSubmitting(false);
    }
  }

  const footer = confirmReplacement ? (
    <div className={classes.footerActions}>
      <button type="button" className={classes.secondaryButton} onClick={onClose}>Anuluj</button>
      <button data-confirm-new-cv type="button" className={classes.primaryButton} onClick={() => setConfirmReplacement(false)}>
        Skonfiguruj nowe CV
      </button>
    </div>
  ) : (
    <div className={classes.footerBar}>
      <div className={classes.footerFeedback}><p className={classes.footerHint}><strong>Krok {step + 1} z 3</strong><span>Treść uzupełnisz w edytorze. Konto dopiero przy zapisie lub eksporcie.</span></p>{error && <p className={classes.error} role="alert">{error}</p>}{submitting && <p className={classes.fieldError} role="status">Przygotowujemy pola i układ Twojego CV…</p>}</div>
      <div className={classes.footerActions}>
        <button type="button" className={classes.secondaryButton} onClick={step === 0 ? onClose : () => navigateStep(step - 1)} disabled={submitting}>{step === 0 ? "Anuluj" : "Wstecz"}</button>
        {step < 2 ? <button type="button" className={classes.primaryButton} onClick={() => navigateStep(step + 1)}>Dalej: {step === 0 ? "kontakt" : "sekcje"}</button> : <button type="button" className={classes.primaryButton} onClick={submit} disabled={submitting}>
          {submitting ? "Tworzenie A4…" : "Utwórz A4"}
        </button>}
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
      title={confirmReplacement ? "Utworzyć nowe CV?" : "Skonfiguruj nowe CV"}
      subtitle={confirmReplacement
        ? "Obecny dokument pozostanie zapisany bez zmian. Nowe CV rozpocznie się jako niezapisany projekt."
        : "Najpierw układ, potem zawartość. Przygotuj punkt wyjścia dla swojego CV."}
      footer={footer}
      initialFocusSelector={confirmReplacement ? "[data-confirm-new-cv]" : initialTemplate ? "#new-cv-contact-heading" : "[data-template-selected='true']"}
    >
      {confirmReplacement ? (
        <div className={classes.confirmation}>
          <p>Po przejściu dalej wybierzesz szablon, kontakty i kolejność sekcji. Poprzedni zapisany projekt nie zostanie nadpisany.</p>
        </div>
      ) : (
        <div className={classes.workspace}>
          <nav aria-label="Etapy konfiguracji CV" className={classes.steps}>
            {STEPS.map((label, index) => <button key={label} type="button" aria-label={`${String(index + 1).padStart(2, "0")} ${label}`} aria-current={step === index ? "step" : undefined} onClick={() => navigateStep(index)} disabled={submitting}><span className={classes.stepNumber}>{String(index + 1).padStart(2, "0")}</span><span className={classes.stepLabel}>{label}</span><span className={classes.stepCompactLabel}>{COMPACT_STEPS[index]}</span></button>)}
          </nav>
          <div className={classes.layout} aria-busy={submitting}>
          <fieldset className={classes.stepContent} disabled={submitting}>
          <legend className={classes.liveStatus}>Opcje konfiguracji CV</legend>
          {step === 0 && <section className={classes.templates} aria-labelledby="new-cv-template-heading">
            <div className={classes.sectionHeading}>
              <div><h3 ref={stepHeadingRef} tabIndex={-1} id="new-cv-template-heading">Wybierz swój układ.</h3><p>Wybrany szablon: {selectedTemplate.name}. Możesz go zmienić także w edytorze.</p></div>
            </div>
            <div className={classes.templateGrid} role="radiogroup" aria-label="Szablon CV">
              {SETUP_TEMPLATES.map((template) => {
                const selected = template.id === config.templateId;
                const locked = !isTemplateAllowed(template, entitlements);
                return (
                  <label
                    key={template.id}
                    className={`${classes.templateCard} ${selected ? classes.templateSelected : ""} ${locked ? classes.templateLocked : ""}`}
                  >
                    <input type="radio" name={`template-${customInputId}`} checked={selected} disabled={locked} onChange={() => selectTemplate(template)} data-template-selected={selected ? "true" : undefined} aria-label={`${template.name}, ${locked ? "wymaga Pro" : template.tier === "free" ? "Free" : "Pro"}, ${template.layouts?.includes("sidebar") ? "2 kolumny" : "1 kolumna"}`} />
                    <span className={classes.templateImage}><img src={`/template-mockups/${template.id}.png`} alt="" /></span>
                    <span className={classes.templateName}>{template.name}{selected && <FiCheck aria-hidden="true" />}</span>
                    <span className={classes.templateMeta}>{locked ? "Wymaga Pro" : template.tier === "free" ? "Free" : "Pro"} · {template.layouts?.includes("sidebar") ? "2 kolumny" : "1 kolumna"}</span>
                  </label>
                );
              })}
            </div>
          </section>}

            {step === 1 && <section className={classes.optionSection} aria-labelledby="new-cv-contact-heading">
              <div className={classes.sectionHeading}>
                <div><h3 ref={stepHeadingRef} tabIndex={-1} id="new-cv-contact-heading">Zacznij od najważniejszych danych.</h3><p>Wybierz pola, które chcesz mieć w CV. Ich treść wpiszesz później na A4. Imię i nazwisko jest wymagane przy zapisie; pozostałe pola są opcjonalne.</p></div>
              </div>
              <div className={classes.checkGrid}>
                <label className={`${classes.checkItem} ${classes.requiredItem}`}><input type="checkbox" checked disabled /><span>Imię i nazwisko</span><small>Wymagane</small></label>
                <label className={classes.checkItem}><input type="checkbox" checked={config.includeTitle} onChange={() => setConfig((current) => ({ ...current, includeTitle: !current.includeTitle }))} /><span>Tytuł zawodowy</span></label>
                {STARTER_CONTACTS.map((contact) => (
                  <label key={contact.key} className={classes.checkItem}>
                    <input type="checkbox" checked={config.contacts.find((item) => item.key === contact.key)?.selected || false} onChange={() => toggleContact(contact.key)} />
                    <span>{contact.label}</span>
                  </label>
                ))}
                <label className={`${classes.checkItem} ${!photoSupported ? classes.disabledItem : ""}`}>
                  <input type="checkbox" checked={config.includePhoto} disabled={!photoSupported} onChange={() => setConfig((current) => ({ ...current, includePhoto: !current.includePhoto }))} />
                  <span>Zdjęcie</span><small>{photoSupported ? "Opcjonalne" : `Niedostępne w ${selectedTemplate.name}`}</small>
                </label>
              </div>
            </section>}

            {step === 2 && <section className={classes.optionSection} aria-labelledby="new-cv-sections-heading">
              <div className={classes.sectionHeading}>
                <div><h3 ref={stepHeadingRef} tabIndex={-1} id="new-cv-sections-heading">Ułóż historię swojego doświadczenia.</h3><p>Zaznacz co najmniej jedną sekcję. Przeciągnij wiersze lub użyj strzałek, aby zmienić kolejność. W dwóch kolumnach kolejność działa osobno w każdej z nich.</p></div>
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
            </section>}
          </fieldset>
          <aside className={classes.preview} aria-label="Podsumowanie konfiguracji">
            <span className={classes.eyebrow}>Twój punkt wyjścia</span>
            <h3>{selectedTemplate.name}</h3>
            <p>{selectedTemplate.description}</p>
            <figure><img src={`/template-mockups/${selectedTemplate.id}.png`} alt={`Przykładowy wygląd szablonu ${selectedTemplate.name}`} /><figcaption>Przykład układu. Twoje CV powstanie z pustymi polami.</figcaption></figure>
            <dl><div><dt>Układ</dt><dd>{selectedTemplate.layouts?.includes("sidebar") ? "2 kolumny" : "1 kolumna"}</dd></div><div><dt>Wybrane sekcje</dt><dd>{selectedSectionCount}</dd></div><div><dt>Zdjęcie</dt><dd>{config.includePhoto ? "Tak" : "Nie"}</dd></div></dl>
            <p>Wskazówki do uzupełnienia zobaczysz tylko w edytorze. Nie trafią do PDF.</p>
          </aside>
          </div>
          <p className={classes.liveStatus} aria-live="polite">{status}</p>
        </div>
      )}
    </DialogShell>
  );
}
