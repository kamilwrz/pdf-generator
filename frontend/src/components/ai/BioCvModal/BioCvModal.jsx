import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import classes from "./BioCvModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { createSerialSaveQueue } from "../../../utils/serialSaveQueue";
import {
    applyBioCvDraftUpdate,
    BIO_CV_STEPS,
    BIO_CV_SUMMARY_STEP,
    buildBioCvPayload,
    canJumpToBioCvSummary,
    createCustomSection,
    createEducation,
    createEmptyBioCvData,
    createExperience,
    createLanguage,
    getBioCvSummaryJumpError,
    normalizeBioCvData,
    parseList,
    validateBioCvStep,
} from "../../../utils/bioCvData";

function ListTextarea({ items, onCommit, placeholder, label }) {
    const [raw, setRaw] = useState(items.join("\n"));

    useEffect(() => {
        setRaw(items.join("\n"));
    }, [items]);

    return (
        <label className={classes.field}>
            {label && <span>{label}</span>}
            <textarea
                value={raw}
                rows={Math.max(3, Math.min(6, raw.split("\n").length + 1))}
                placeholder={placeholder}
                onChange={(event) => setRaw(event.target.value)}
                onBlur={() => onCommit(parseList(raw))}
            />
            <small>Jedna pozycja w wierszu lub oddzielona przecinkiem.</small>
        </label>
    );
}

function TextField({ label, value, onChange, placeholder, type = "text", full = false }) {
    return (
        <label className={`${classes.field} ${full ? classes.full : ""}`}>
            <span>{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    );
}

function CardHeader({ title, index, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
    return (
        <div className={classes.cardHeader}>
            <strong>{title} {index + 1}</strong>
            <div className={classes.cardActions}>
                <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Przesuń ${title.toLowerCase()} wyżej`}>↑</button>
                <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Przesuń ${title.toLowerCase()} niżej`}>↓</button>
                <button type="button" onClick={onRemove} className={classes.removeBtn}>Usuń</button>
            </div>
        </div>
    );
}

export default function BioCvModal() {
    const {
        isBioCvModal,
        showBioCvModal,
        loadAiElements,
        entitlements,
    } = use(PdfContext);
    const api = useMemo(
        () => new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
        [],
    );
    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);
    const [profile, setProfile] = useState(createEmptyBioCvData);
    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [stepError, setStepError] = useState(null);
    const [fillingId, setFillingId] = useState(null);
    const saveTimer = useRef(null);
    const profileRef = useRef(profile);
    const readyRef = useRef(false);
    const skipAutosaveRef = useRef(false);
    const saveQueueRef = useRef(null);
    if (saveQueueRef.current === null) {
        saveQueueRef.current = createSerialSaveQueue((pending) => {
            setIsSaving(pending > 0);
        });
    }

    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    const saveDraft = useCallback(async (data = profileRef.current, { silent = false } = {}) => {
        if (!readyRef.current) return Promise.resolve();
        const payload = buildBioCvPayload(data);

        return saveQueueRef.current.enqueue(async () => {
            if (!silent) setSaveError(null);
            try {
                await api.httpRequest(
                    ENDPOINTS.AI.BIO_CV_DRAFT,
                    "PUT",
                    JSON.stringify({ cv_data: payload }),
                    "Nie udało się zapisać szkicu.",
                );
            } catch (error) {
                setSaveError(error.message || "Nie udało się zapisać szkicu.");
            }
        });
    }, [api]);

    useEffect(() => {
        if (!isBioCvModal) {
            readyRef.current = false;
            setIsReady(false);
            return undefined;
        }

        let active = true;
        setIsLoading(true);
        setSaveError(null);
        setStepError(null);
        setStep(0);
        setProfile(createEmptyBioCvData());

        api.httpRequest(ENDPOINTS.AI.BIO_CV_DRAFT, "GET", null, "Nie udało się pobrać szkicu.")
            .then((response) => {
                if (!active) return;
                setProfile(normalizeBioCvData(response?.cv_data));
                readyRef.current = true;
                setIsReady(true);
            })
            .catch((error) => {
                if (!active) return;
                setSaveError(error.message || "Nie udało się pobrać szkicu.");
                readyRef.current = true;
                setIsReady(true);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [api, isBioCvModal]);

    useEffect(() => {
        if (!isReady || !isBioCvModal) return undefined;
        if (skipAutosaveRef.current) {
            skipAutosaveRef.current = false;
            return undefined;
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveTimer.current = null;
            saveDraft(profile, { silent: true });
        }, 650);
        return () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
        };
    }, [isBioCvModal, isReady, profile, saveDraft]);

    const updateProfile = useCallback((updater) => {
        setStepError(null);
        setProfile((current) => applyBioCvDraftUpdate(current, updater));
    }, []);

    const updateListItem = useCallback((field, index, changes) => {
        updateProfile((current) => ({
            ...current,
            [field]: current[field].map((item, itemIndex) => (
                itemIndex === index ? { ...item, ...changes } : item
            )),
        }));
    }, [updateProfile]);

    const removeListItem = useCallback((field, index) => {
        updateProfile((current) => ({
            ...current,
            [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
        }));
    }, [updateProfile]);

    const moveListItem = useCallback((field, index, direction) => {
        updateProfile((current) => {
            const target = index + direction;
            if (target < 0 || target >= current[field].length) return current;
            const next = [...current[field]];
            [next[index], next[target]] = [next[target], next[index]];
            return { ...current, [field]: next };
        });
    }, [updateProfile]);

    const goNext = useCallback(() => {
        const error = validateBioCvStep(step, profile);
        if (error) {
            setStepError(error);
            return;
        }
        setStepError(null);
        setStep((current) => Math.min(current + 1, BIO_CV_SUMMARY_STEP));
    }, [profile, step]);

    const jumpToSummary = useCallback(() => {
        const error = getBioCvSummaryJumpError(profile);
        if (error) {
            setStepError(error);
            return;
        }
        setStepError(null);
        setStep(BIO_CV_SUMMARY_STEP);
    }, [profile]);

    const canJumpSummary = canJumpToBioCvSummary(profile);

    const handleClose = useCallback(async () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        await saveDraft(profileRef.current, { silent: true });
        showBioCvModal();
    }, [saveDraft, showBioCvModal]);

    const clearDraft = useCallback(async () => {
        if (!window.confirm("Wyczyścić wszystkie dane zapisane w szkicu CV?")) return;
        try {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
            await saveQueueRef.current.whenIdle();
            await api.httpRequest(ENDPOINTS.AI.BIO_CV_DRAFT, "DELETE", null, "Nie udało się usunąć szkicu.");
            skipAutosaveRef.current = true;
            const emptyProfile = createEmptyBioCvData();
            profileRef.current = emptyProfile;
            setProfile(emptyProfile);
            setStep(0);
            setStepError(null);
            setSaveError(null);
        } catch (error) {
            setSaveError(error.message || "Nie udało się usunąć szkicu.");
        }
    }, [api]);

    const handleFill = useCallback(async (template) => {
        if (!isTemplateAllowed(template, entitlements)) {
            setSaveError("Ten szablon jest dostępny w planie Standard.");
            return;
        }
        const error = validateBioCvStep(0, profile);
        if (error) {
            setStep(0);
            setStepError(error);
            return;
        }
        setFillingId(template.id);
        setSaveError(null);
        try {
            const payload = buildBioCvPayload(profile);
            await saveDraft(payload, { silent: true });
            const response = await api.httpRequest(
                ENDPOINTS.AI.FILL_TEMPLATE,
                "POST",
                JSON.stringify({ cv_data: payload, template_id: template.id }),
                "Nie udało się utworzyć CV.",
            );
            await loadAiElements(response.elements, `CV ${template.name}`);
            showBioCvModal();
        } catch (error) {
            setSaveError(error.message || "Nie udało się utworzyć CV.");
        } finally {
            setFillingId(null);
        }
    }, [api, entitlements, loadAiElements, profile, saveDraft, showBioCvModal]);

    const renderPersonal = () => (
        <div className={classes.formGrid}>
            <TextField label="Imię i nazwisko *" value={profile.name} onChange={(name) => updateProfile({ ...profile, name })} placeholder="np. Anna Kowalska" />
            <TextField label="Stanowisko docelowe" value={profile.title} onChange={(title) => updateProfile({ ...profile, title })} placeholder="np. Product Manager" />
            <TextField label="Adres / lokalizacja" value={profile.address} onChange={(address) => updateProfile({ ...profile, address })} placeholder="np. Warszawa, Polska" />
            <TextField label="Telefon" value={profile.phone} onChange={(phone) => updateProfile({ ...profile, phone })} placeholder="+48 500 000 000" type="tel" />
            <TextField label="E-mail" value={profile.email} onChange={(email) => updateProfile({ ...profile, email })} placeholder="anna@example.com" type="email" full />
            <label className={`${classes.field} ${classes.full}`}>
                <span>Podsumowanie zawodowe</span>
                <textarea value={profile.summary} rows="5" placeholder="Krótko opisz swoje doświadczenie, specjalizację i kierunek zawodowy." onChange={(event) => updateProfile({ ...profile, summary: event.target.value })} />
            </label>
        </div>
    );

    const renderExperience = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Dodaj stanowiska od najnowszego. Opis możesz podać jako osiągnięcia lub zakres obowiązków.</p>
            {profile.experience.map((entry, index) => (
                <section className={classes.entryCard} key={`experience-${index}`}>
                    <CardHeader
                        title="Stanowisko"
                        index={index}
                        onRemove={() => removeListItem("experience", index)}
                        onMoveUp={() => moveListItem("experience", index, -1)}
                        onMoveDown={() => moveListItem("experience", index, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < profile.experience.length - 1}
                    />
                    <div className={classes.formGrid}>
                        <TextField label="Stanowisko *" value={entry.title} onChange={(title) => updateListItem("experience", index, { title })} placeholder="np. Senior Developer" />
                        <TextField label="Pracodawca *" value={entry.company} onChange={(company) => updateListItem("experience", index, { company })} placeholder="Nazwa firmy" />
                        <TextField label="Miasto" value={entry.city} onChange={(city) => updateListItem("experience", index, { city })} placeholder="np. Kraków" />
                        <TextField label="Okres" value={entry.period} onChange={(period) => updateListItem("experience", index, { period })} placeholder="2022 – obecnie" />
                        <div className={classes.full}>
                            <ListTextarea
                                label="Osiągnięcia / opis"
                                items={entry.bullets}
                                onCommit={(bullets) => updateListItem("experience", index, { bullets })}
                                placeholder="Zwiększyłam konwersję o 20%"
                            />
                        </div>
                    </div>
                </section>
            ))}
            <button type="button" className={classes.addBtn} onClick={() => updateProfile((current) => ({ ...current, experience: [...current.experience, createExperience()] }))}>+ Dodaj stanowisko</button>
        </div>
    );

    const renderEducation = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Dodaj szkoły lub uczelnie wraz z kierunkiem i najważniejszymi informacjami.</p>
            {profile.education.map((entry, index) => (
                <section className={classes.entryCard} key={`education-${index}`}>
                    <CardHeader
                        title="Edukacja"
                        index={index}
                        onRemove={() => removeListItem("education", index)}
                        onMoveUp={() => moveListItem("education", index, -1)}
                        onMoveDown={() => moveListItem("education", index, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < profile.education.length - 1}
                    />
                    <div className={classes.formGrid}>
                        <TextField label="Uczelnia / szkoła *" value={entry.school} onChange={(school) => updateListItem("education", index, { school })} placeholder="np. Uniwersytet Warszawski" />
                        <TextField label="Miasto" value={entry.city} onChange={(city) => updateListItem("education", index, { city })} placeholder="np. Warszawa" />
                        <TextField label="Okres" value={entry.period} onChange={(period) => updateListItem("education", index, { period })} placeholder="2017 – 2022" />
                        <TextField label="Dyplom / kierunek *" value={entry.degree} onChange={(degree) => updateListItem("education", index, { degree })} placeholder="np. Magister informatyki" full />
                        <label className={`${classes.field} ${classes.full}`}>
                            <span>Opis</span>
                            <textarea value={entry.description} rows="3" placeholder="Specjalizacja, wyróżnienie, istotne projekty." onChange={(event) => updateListItem("education", index, { description: event.target.value })} />
                        </label>
                    </div>
                </section>
            ))}
            <button type="button" className={classes.addBtn} onClick={() => updateProfile((current) => ({ ...current, education: [...current.education, createEducation()] }))}>+ Dodaj edukację</button>
        </div>
    );

    const renderSkills = () => (
        <div className={classes.singleStep}>
            <p className={classes.intro}>Dodaj umiejętności techniczne, branżowe i miękkie. Powtórzenia zostaną automatycznie usunięte.</p>
            <ListTextarea items={profile.skills} onCommit={(skills) => updateProfile({ ...profile, skills })} placeholder={"Zarządzanie projektami\nFigma\nAnaliza danych"} label="Umiejętności" />
        </div>
    );

    const renderLanguages = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Poziom jest opcjonalny, ale pomaga rekruterowi szybko ocenić znajomość języka.</p>
            {profile.languages.map((entry, index) => (
                <section className={classes.entryCard} key={`language-${index}`}>
                    <CardHeader
                        title="Język"
                        index={index}
                        onRemove={() => removeListItem("languages", index)}
                        onMoveUp={() => moveListItem("languages", index, -1)}
                        onMoveDown={() => moveListItem("languages", index, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < profile.languages.length - 1}
                    />
                    <div className={classes.formGrid}>
                        <TextField label="Język" value={entry.name} onChange={(name) => updateListItem("languages", index, { name })} placeholder="np. Angielski" />
                        <TextField label="Poziom" value={entry.level} onChange={(level) => updateListItem("languages", index, { level })} placeholder="np. C1 / biegły" />
                    </div>
                </section>
            ))}
            <button type="button" className={classes.addBtn} onClick={() => updateProfile((current) => ({ ...current, languages: [...current.languages, createLanguage()] }))}>+ Dodaj język</button>
        </div>
    );

    const renderCustom = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Dodaj np. certyfikaty, projekty, publikacje, wolontariat lub zainteresowania.</p>
            {profile.custom_sections.map((section, index) => (
                <section className={classes.entryCard} key={`custom-${index}`}>
                    <CardHeader
                        title="Sekcja"
                        index={index}
                        onRemove={() => removeListItem("custom_sections", index)}
                        onMoveUp={() => moveListItem("custom_sections", index, -1)}
                        onMoveDown={() => moveListItem("custom_sections", index, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < profile.custom_sections.length - 1}
                    />
                    <div className={classes.formGrid}>
                        <TextField label="Tytuł sekcji *" value={section.title} onChange={(title) => updateListItem("custom_sections", index, { title })} placeholder="np. Certyfikaty" />
                        <label className={classes.field}>
                            <span>Typ</span>
                            <select value={section.kind} onChange={(event) => updateListItem("custom_sections", index, { kind: event.target.value })}>
                                <option value="other">Inna</option>
                                <option value="certifications">Certyfikaty</option>
                                <option value="interests">Zainteresowania</option>
                            </select>
                        </label>
                        <label className={classes.field}>
                            <span>Umieść</span>
                            <select value={section.placement} onChange={(event) => updateListItem("custom_sections", index, { placement: event.target.value })}>
                                <option value="after_skills">Po umiejętnościach</option>
                                <option value="after_experience">Po doświadczeniu</option>
                            </select>
                        </label>
                        <div className={classes.full}>
                            <ListTextarea
                                label="Pozycje *"
                                items={section.items}
                                onCommit={(items) => updateListItem("custom_sections", index, { items })}
                                placeholder={"Certyfikat Scrum Master\nKurs analizy danych"}
                            />
                        </div>
                    </div>
                </section>
            ))}
            <button type="button" className={classes.addBtn} onClick={() => updateProfile((current) => ({ ...current, custom_sections: [...current.custom_sections, createCustomSection()] }))}>+ Dodaj sekcję własną</button>
        </div>
    );

    const renderReview = () => (
        <div className={classes.review}>
            <div className={classes.reviewIdentity}>
                <strong>{profile.name || "Twoje CV"}</strong>
                {profile.title && <span>{profile.title}</span>}
            </div>
            <div className={classes.reviewStats}>
                <span>{profile.experience.length} doświadczeń</span>
                <span>{profile.education.length} wpisów edukacji</span>
                <span>{profile.skills.length} umiejętności</span>
                <span>{profile.languages.filter((entry) => entry.name).length} języków</span>
                <span>{profile.custom_sections.length} sekcji własnych</span>
            </div>
            <p>Wybierz szablon. Dane pozostaną zapisane, więc możesz później wygenerować kolejny wariant CV.</p>
            <div className={classes.templateGrid}>
                {cvTemplates.map((template) => {
                    const locked = !isTemplateAllowed(template, entitlements);
                    return (
                        <button
                            type="button"
                            key={template.id}
                            className={classes.templateCard}
                            onClick={() => handleFill(template)}
                            disabled={fillingId !== null || locked}
                            title={locked ? "Dostępne w planie Standard" : undefined}
                        >
                            <span className={classes.templateAccent} style={{ backgroundColor: template.accent }} />
                            <span className={classes.templateCopy}>
                                <strong>{template.name}</strong>
                                <small>{template.industry}</small>
                            </span>
                            <span className={classes.templateAction}>
                                {fillingId === template.id ? "Tworzenie…" : (locked ? "Zablokowany" : "Utwórz CV")}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const content = [
        renderPersonal,
        renderExperience,
        renderEducation,
        renderSkills,
        renderLanguages,
        renderCustom,
        renderReview,
    ][step]();

    return (
        <DialogShell
            open={isBioCvModal}
            onClose={handleClose}
            width={760}
            title="Utwórz CV krok po kroku"
            subtitle="Uzupełnij dane raz — później wygenerujesz CV w dowolnym szablonie."
            footer={
                <div className={classes.footer}>
                    <div className={classes.draftState}>
                        <span>Krok {step + 1} z {BIO_CV_STEPS.length}</span>
                        {isSaving && <em>Zapisywanie…</em>}
                        {!isSaving && isReady && !saveError && <em>Zapisano szkic</em>}
                    </div>
                    <div className={classes.footerActions}>
                        <button type="button" className={classes.clearBtn} onClick={clearDraft}>Wyczyść szkic</button>
                        {step > 0 && <button type="button" className={classes.cancelBtn} onClick={() => { setStep((current) => current - 1); setStepError(null); }}>Wstecz</button>}
                        {step < BIO_CV_SUMMARY_STEP && (
                            <button
                                type="button"
                                className={classes.cancelBtn}
                                onClick={jumpToSummary}
                                disabled={!canJumpSummary}
                                title={canJumpSummary
                                    ? "Przejdź od razu do podsumowania i wyboru szablonu"
                                    : (getBioCvSummaryJumpError(profile) || "Uzupełnij pola obowiązkowe")}
                            >
                                Do podsumowania
                            </button>
                        )}
                        {step < BIO_CV_SUMMARY_STEP && <button type="button" className={classes.primaryBtn} onClick={goNext}>Dalej</button>}
                    </div>
                </div>
            }
        >
            <div className={classes.progress} aria-label={`Krok ${step + 1}: ${BIO_CV_STEPS[step]}`}>
                {BIO_CV_STEPS.map((label, index) => (
                    <button
                        type="button"
                        key={label}
                        className={`${classes.progressStep} ${index === step ? classes.active : ""} ${index < step ? classes.complete : ""}`}
                        onClick={() => {
                            if (index < step) {
                                setStep(index);
                                setStepError(null);
                                return;
                            }
                            if (index === BIO_CV_SUMMARY_STEP && canJumpSummary) {
                                jumpToSummary();
                            }
                        }}
                        disabled={index > step && !(index === BIO_CV_SUMMARY_STEP && canJumpSummary)}
                    >
                        <span>{index + 1}</span>
                        <small>{label}</small>
                    </button>
                ))}
            </div>
            <section className={classes.body}>
                <div className={classes.sectionHeading}>
                    <span>Etap {step + 1}</span>
                    <h3>{BIO_CV_STEPS[step]}</h3>
                </div>
                {isLoading ? <p className={classes.loading}>Odtwarzanie zapisanego szkicu…</p> : content}
                {stepError && <div className={classes.error}>{stepError}</div>}
                {saveError && <div className={classes.error}>{saveError}</div>}
            </section>
        </DialogShell>
    );
}
