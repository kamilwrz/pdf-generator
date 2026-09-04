/**
 * Configures a new editable A4 CV and protects user-authored work from
 * accidental replacement.
 *
 * Product-owned sample content may opt into replacement without confirmation.
 * This keeps the demo-to-editor transition direct while preserving the guard
 * for saved and unsaved documents that belong to the user.
 */
import { useId, useMemo, useRef, useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import { TEMPLATES } from "../../../templates";
import { isTemplateAllowed } from "../../../utils/entitlements";
import {
  createDefaultStarterConfig,
  PHOTO_TEMPLATE_IDS,
  STARTER_CONTACTS,
} from "../../../utils/cvStarter.js";
import classes from "./NewCvSetupModal.module.css";

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
}) {
  const [config, setConfig] = useState(createDefaultStarterConfig);
  const [confirmReplacement, setConfirmReplacement] = useState(hasActiveDocument);
  const [customTitle, setCustomTitle] = useState("");
  const [draggedKey, setDraggedKey] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const customInputId = useId();
  const submitRef = useRef(null);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === config.templateId) || TEMPLATES[0],
    [config.templateId],
  );
  const photoSupported = PHOTO_TEMPLATE_IDS.has(selectedTemplate.id);

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
  }

  function addCustomSection() {
    const label = customTitle.trim();
    if (!label) return;
    const duplicate = config.sections.some((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate) {
      setError("Sekcja o tej nazwie już istnieje.");
      return;
    }
    const key = `custom-${Date.now()}-${config.sections.length}`;
    setConfig((current) => ({
      ...current,
      sections: [...current.sections, { key, label, selected: true, custom: true }],
    }));
    setCustomTitle("");
    setError("");
    setStatus(`Dodano sekcję ${label}.`);
  }

  async function submit() {
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
      if (created !== false) onClose();
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
      <p className={classes.footerHint}>Treść uzupełnisz bezpośrednio na A4. Konto będzie potrzebne dopiero przy zapisie lub eksporcie.</p>
      <div className={classes.footerActions}>
        <button type="button" className={classes.secondaryButton} onClick={onClose} disabled={submitting}>Anuluj</button>
        <button ref={submitRef} type="button" className={classes.primaryButton} onClick={submit} disabled={submitting}>
          {submitting ? "Tworzenie A4…" : "Utwórz A4"}
        </button>
      </div>
    </div>
  );

  return (
    <DialogShell
      open={open}
      onClose={submitting ? () => {} : onClose}
      width={1240}
      surface="paper"
      title={confirmReplacement ? "Utworzyć nowe CV?" : "Skonfiguruj nowe CV"}
      subtitle={confirmReplacement
        ? "Obecny dokument pozostanie zapisany bez zmian. Nowe CV rozpocznie się jako niezapisany projekt."
        : "Wybierz układ i pola. Wszystkie wskazówki są widoczne tylko w edytorze i nie trafią do PDF."}
      footer={footer}
      initialFocusSelector={confirmReplacement ? "[data-confirm-new-cv]" : "[data-template-selected='true']"}
    >
      {confirmReplacement ? (
        <div className={classes.confirmation}>
          <p>Po przejściu dalej wybierzesz szablon, kontakty i kolejność sekcji. Poprzedni zapisany projekt nie zostanie nadpisany.</p>
        </div>
      ) : (
        <div className={classes.layout}>
          <section className={classes.templates} aria-labelledby="new-cv-template-heading">
            <div className={classes.sectionHeading}>
              <span className={classes.eyebrow}>01</span>
              <div><h3 id="new-cv-template-heading">Szablon</h3><p>Meridian jest wybrany na start.</p></div>
            </div>
            <div className={classes.templateGrid} role="radiogroup" aria-label="Szablon CV">
              {TEMPLATES.map((template) => {
                const selected = template.id === config.templateId;
                const locked = !isTemplateAllowed(template, entitlements);
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={locked}
                    data-template-selected={selected ? "true" : undefined}
                    className={`${classes.templateCard} ${selected ? classes.templateSelected : ""} ${locked ? classes.templateLocked : ""}`}
                    onClick={() => selectTemplate(template)}
                    disabled={locked}
                  >
                    <span className={classes.templateImage}><img src={`/template-mockups/${template.id}.png`} alt="" /></span>
                    <span className={classes.templateName}>{template.name}</span>
                    <span className={classes.templateMeta}>{locked ? "PRO" : template.layouts?.includes("sidebar") ? "2 kolumny" : "1 kolumna"}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className={classes.options}>
            <section className={classes.optionSection} aria-labelledby="new-cv-contact-heading">
              <div className={classes.sectionHeading}>
                <span className={classes.eyebrow}>02</span>
                <div><h3 id="new-cv-contact-heading">Nagłówek i kontakt</h3><p>Imię i nazwisko jest zawsze dostępne i wymagane przy zapisie.</p></div>
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
            </section>

            <section className={classes.optionSection} aria-labelledby="new-cv-sections-heading">
              <div className={classes.sectionHeading}>
                <span className={classes.eyebrow}>03</span>
                <div><h3 id="new-cv-sections-heading">Sekcje i kolejność</h3><p>Przeciągnij lub użyj przycisków. W układzie dwukolumnowym kolejność działa osobno w każdej kolumnie.</p></div>
              </div>
              <ol className={classes.sectionList}>
                {config.sections.map((section, index) => (
                  <li
                    key={section.key}
                    className={`${classes.sectionRow} ${draggedKey === section.key ? classes.dragging : ""}`}
                    draggable
                    onDragStart={() => setDraggedKey(section.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropBefore(section.key)}
                    onDragEnd={() => setDraggedKey(null)}
                  >
                    <span className={classes.dragHandle} aria-hidden="true">⠿</span>
                    <label><input type="checkbox" checked={section.selected} onChange={() => toggleSection(section.key)} /><span>{section.label}</span></label>
                    <div className={classes.reorderButtons}>
                      <button type="button" onClick={() => reorder(section.key, "up")} disabled={index === 0} aria-label={`Przenieś ${section.label} wyżej`}>↑</button>
                      <button type="button" onClick={() => reorder(section.key, "down")} disabled={index === config.sections.length - 1} aria-label={`Przenieś ${section.label} niżej`}>↓</button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={classes.customSection}>
                <label htmlFor={customInputId}>Własna sekcja</label>
                <div><input id={customInputId} value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomSection(); } }} placeholder="np. Konferencje" /><button type="button" onClick={addCustomSection} disabled={!customTitle.trim()}>Dodaj</button></div>
              </div>
            </section>
          </div>
          <p className={classes.liveStatus} aria-live="polite">{status}</p>
          {error ? <p className={classes.error} role="alert">{error}</p> : null}
        </div>
      )}
    </DialogShell>
  );
}
