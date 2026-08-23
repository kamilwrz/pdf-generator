/**
 * Guided bio/CV wizard with draft autosave. Every onboarding entry collects
 * four data steps; guests authenticate before the Regent is generated, while
 * authenticated users can generate it immediately.
 *
 * Authenticated users persist drafts via PUT /ai/bio_cv_draft.
 * Guests persist the same profile to localStorage (`guestWizardDraft.js`).
 * Draft writes are serialised so older responses cannot overwrite newer edits.
 */
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import classes from "./BioCvModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { fillTemplate } from "../../../services/fillTemplate";
import { TEMPLATES } from "../../../templates";
import TemplateCarousel from "../AiCvPanel/TemplateCarousel";
import DialogShell from "../../common/DialogShell/DialogShell";
import {
    clearAccessToken,
    getAccessToken,
    isAuthFailure,
} from "../../../utils/authSession";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import { isTemplateAllowed, planErrorMessage } from "../../../utils/entitlements";
import { adoptGuestWizardDraftForAccount } from "../../../utils/claimGuestWizardDraft";
import {
    clearGuestWizardDraft,
    hasGuestWizardDraft,
    loadGuestWizardDraft,
    saveGuestWizardDraft,
} from "../../../utils/guestWizardDraft";
import { createSerialSaveQueue } from "../../../utils/serialSaveQueue";
import {
    applyBioCvDraftUpdate,
    BIO_CV_ONBOARDING_STEPS,
    BIO_CV_STEPS,
    BIO_CV_SUMMARY_STEP,
    buildBioCvPayload,
    canJumpToBioCvSummary,
    createCustomSectionFromPreset,
    createEducation,
    createEmptyBioCvData,
    createExperience,
    createLanguage,
    CUSTOM_SECTION_PRESETS,
    getBioCvSummaryJumpError,
    LANGUAGE_CEFR_LEVELS,
    normalizeBioCvData,
    parseList,
    parseSkills,
    validateBioCvStep,
} from "../../../utils/bioCvData";
import { availableExtraContactKinds } from "../../../utils/contactLinks";

function formatSavedAt(timestamp) {
    if (!timestamp) return "";
    try {
        return new Date(timestamp).toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function entryHasValues(entry) {
    return Object.values(entry || {}).some((value) => (
        Array.isArray(value) ? value.length > 0 : String(value || "").trim()
    ));
}

function ListTextarea({ items, onCommit, placeholder, label, hint, parse = parseList }) {
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
                onBlur={() => onCommit(parse(raw))}
            />
            <small>{hint || "Każdy punkt wpisz w osobnej linii."}</small>
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

/**
 * CEFR level picker for the languages step. Empty value is allowed (optional).
 * Native select is wrapped so the chevron and filled state can be styled.
 */
function LanguageLevelSelect({ value, onChange }) {
    const selected = LANGUAGE_CEFR_LEVELS.includes(value) ? value : "";
    return (
        <label className={classes.field}>
            <span>Poziom</span>
            <span className={`${classes.selectShell} ${selected ? classes.selectFilled : ""}`}>
                <select
                    value={selected}
                    onChange={(event) => onChange(event.target.value)}
                    aria-label="Poziom znajomości języka (CEFR)"
                >
                    <option value="">Bez poziomu</option>
                    {LANGUAGE_CEFR_LEVELS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                    ))}
                </select>
            </span>
        </label>
    );
}

function CompactCard({ title, subtitle, meta, onEdit, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
    return (
        <article className={classes.compactCard}>
            <div className={classes.compactBody}>
                <strong>{title || "Bez tytułu"}</strong>
                {subtitle && <span>{subtitle}</span>}
                {meta && <em>{meta}</em>}
            </div>
            <div className={classes.compactActions}>
                <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Przesuń wyżej">↑</button>
                <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Przesuń niżej">↓</button>
                <button type="button" className={classes.editBtn} onClick={onEdit}>Edytuj</button>
                <button type="button" className={classes.removeBtn} onClick={onRemove}>Usuń</button>
            </div>
        </article>
    );
}

export default function BioCvModal({ variant = "full" }) {
    const {
        isBioCvModal,
        showBioCvModal,
        cancelBioCvModal,
        loadAiElements,
        entitlements,
        setActiveCvData,
        flowSpacing,
    } = use(PdfContext);
    const navigate = useNavigate();
    const isDemoConversion = variant === "demo-conversion";
    const isGuestOnboarding = variant === "guest-onboarding" || isDemoConversion;
    const wizardSteps = isGuestOnboarding ? BIO_CV_ONBOARDING_STEPS : BIO_CV_STEPS;
    const finalStep = wizardSteps.length - 1;
    const hasAuthenticatedSession = Boolean(getAccessToken());
    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);

    const createApi = useCallback(() => {
        const token = getAccessToken();
        return new ApiClient(token ? { Authorization: `Bearer ${token}` } : {});
    }, []);

    const [profile, setProfile] = useState(createEmptyBioCvData);
    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [isGuestSession, setIsGuestSession] = useState(() => !getAccessToken());
    const [saveError, setSaveError] = useState(null);
    const [stepError, setStepError] = useState(null);
    const [fillingId, setFillingId] = useState(null);
    const [resumeDraft, setResumeDraft] = useState(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [editingKey, setEditingKey] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showTypePicker, setShowTypePicker] = useState(false);

    const saveTimer = useRef(null);
    const profileRef = useRef(profile);
    const stepRef = useRef(step);
    const selectedTemplateIdRef = useRef(null);
    const readyRef = useRef(false);
    const skipAutosaveRef = useRef(false);
    const saveQueueRef = useRef(null);
    const menuRef = useRef(null);

    if (saveQueueRef.current === null) {
        saveQueueRef.current = createSerialSaveQueue((pending) => {
            setIsSaving(pending > 0);
        });
    }

    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    useEffect(() => {
        stepRef.current = step;
    }, [step]);

    useEffect(() => {
        selectedTemplateIdRef.current = selectedTemplateId;
    }, [selectedTemplateId]);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const onPointer = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };
        window.addEventListener("pointerdown", onPointer);
        return () => window.removeEventListener("pointerdown", onPointer);
    }, [menuOpen]);

    const saveDraft = useCallback(async (
        data = profileRef.current,
        { silent = false, stepOverride } = {},
    ) => {
        if (!readyRef.current) return Promise.resolve();
        const currentStep = stepOverride ?? stepRef.current;

        if (!getAccessToken()) {
            return saveQueueRef.current.enqueue(async () => {
                if (!silent) setSaveError(null);
                setIsGuestSession(true);
                saveGuestWizardDraft({
                    step: currentStep,
                    profile: data,
                    selectedTemplateId: selectedTemplateIdRef.current,
                });
                setLastSavedAt(Date.now());
            });
        }

        const payload = buildBioCvPayload(data);
        return saveQueueRef.current.enqueue(async () => {
            if (!silent) setSaveError(null);
            try {
                await createApi().httpRequest(
                    ENDPOINTS.AI.BIO_CV_DRAFT,
                    "PUT",
                    JSON.stringify({ cv_data: payload }),
                    "Nie udało się zapisać szkicu.",
                );
                setIsGuestSession(false);
                setLastSavedAt(Date.now());
            } catch (error) {
                if (isAuthFailure(error)) {
                    clearAccessToken();
                    setIsGuestSession(true);
                    setSaveError(null);
                    saveGuestWizardDraft({
                        step: currentStep,
                        profile: data,
                        selectedTemplateId: selectedTemplateIdRef.current,
                    });
                    setLastSavedAt(Date.now());
                    return;
                }
                setSaveError(error.message || "Nie udało się zapisać szkicu.");
            }
        });
    }, [createApi]);

    const beginFreshWizard = useCallback(() => {
        skipAutosaveRef.current = true;
        const emptyProfile = createEmptyBioCvData();
        profileRef.current = emptyProfile;
        setProfile(emptyProfile);
        setStep(0);
        selectedTemplateIdRef.current = null;
        setSelectedTemplateId(null);
        setEditingKey(null);
        setShowTypePicker(false);
        setStepError(null);
        setSaveError(null);
        setLastSavedAt(null);
        setResumeDraft(null);
        readyRef.current = true;
        setIsReady(true);
        setIsLoading(false);
    }, []);

    const beginFromDraft = useCallback((draft) => {
        skipAutosaveRef.current = true;
        const nextProfile = normalizeBioCvData(draft.profile);
        profileRef.current = nextProfile;
        setProfile(nextProfile);
        setStep(Math.min(Number(draft.step) || 0, finalStep));
        selectedTemplateIdRef.current = draft.selectedTemplateId ?? null;
        setSelectedTemplateId(draft.selectedTemplateId ?? null);
        setEditingKey(null);
        setShowTypePicker(false);
        setStepError(null);
        setSaveError(null);
        setLastSavedAt(draft.updatedAt || Date.now());
        setResumeDraft(null);
        readyRef.current = true;
        setIsReady(true);
        setIsLoading(false);
    }, [finalStep]);

    useEffect(() => {
        if (!isBioCvModal) {
            readyRef.current = false;
            setIsReady(false);
            setResumeDraft(null);
            setMenuOpen(false);
            setEditingKey(null);
            setShowTypePicker(false);
            return undefined;
        }

        let active = true;
        setIsLoading(true);
        setSaveError(null);
        setStepError(null);
        setEditingKey(null);
        setShowTypePicker(false);
        setMenuOpen(false);
        readyRef.current = false;
        setIsReady(false);

        if (!getAccessToken()) {
            setIsGuestSession(true);
            if (hasGuestWizardDraft()) {
                const draft = loadGuestWizardDraft();
                if (active && draft) {
                    // Keep profile/refs aligned with localStorage while the
                    // resume prompt is visible. An empty shell here used to
                    // let a close/autosave race overwrite a good draft.
                    const nextProfile = normalizeBioCvData(draft.profile);
                    profileRef.current = nextProfile;
                    setProfile(nextProfile);
                    setStep(Math.min(Number(draft.step) || 0, finalStep));
                    selectedTemplateIdRef.current = draft.selectedTemplateId ?? null;
                    setSelectedTemplateId(draft.selectedTemplateId ?? null);
                    setLastSavedAt(draft.updatedAt || Date.now());
                    setResumeDraft(draft);
                    setIsLoading(false);
                } else if (active) {
                    beginFreshWizard();
                }
            } else if (active) {
                beginFreshWizard();
            }
            return () => {
                active = false;
            };
        }

        setIsGuestSession(false);
        setProfile(createEmptyBioCvData());
        setStep(0);

        // Demo/guest wizard data must survive register/login into Free (and
        // future paid) accounts. Adopt localStorage into `/ai/bio_cv_draft`
        // when the account draft is empty; never overwrite a filled account
        // draft. Do not clear the guest snapshot before this runs.
        (async () => {
            try {
                const api = createApi();
                const claim = await adoptGuestWizardDraftForAccount(api);
                if (!active) return;

                if (claim.profile && (claim.adopted || claim.serverChecked)) {
                    skipAutosaveRef.current = true;
                    profileRef.current = claim.profile;
                    setProfile(claim.profile);
                    setStep(claim.adopted ? Math.min(Number(claim.step) || 0, finalStep) : 0);
                    selectedTemplateIdRef.current = claim.adopted
                        ? (claim.selectedTemplateId ?? null)
                        : null;
                    setSelectedTemplateId(
                        claim.adopted ? (claim.selectedTemplateId ?? null) : null,
                    );
                    setLastSavedAt(Date.now());
                    readyRef.current = true;
                    setIsReady(true);
                    return;
                }

                const response = await api.httpRequest(
                    ENDPOINTS.AI.BIO_CV_DRAFT,
                    "GET",
                    null,
                    "Nie udało się pobrać szkicu.",
                );
                if (!active) return;
                const nextProfile = normalizeBioCvData(response?.cv_data);
                profileRef.current = nextProfile;
                setProfile(nextProfile);
                setLastSavedAt(Date.now());
                readyRef.current = true;
                setIsReady(true);
            } catch (error) {
                if (!active) return;
                if (isAuthFailure(error)) {
                    clearAccessToken();
                    setIsGuestSession(true);
                    setSaveError(null);
                    if (hasGuestWizardDraft()) {
                        const draft = loadGuestWizardDraft();
                        if (draft) {
                            const nextProfile = normalizeBioCvData(draft.profile);
                            profileRef.current = nextProfile;
                            setProfile(nextProfile);
                            setStep(Math.min(Number(draft.step) || 0, finalStep));
                            selectedTemplateIdRef.current = draft.selectedTemplateId ?? null;
                            setSelectedTemplateId(draft.selectedTemplateId ?? null);
                            setLastSavedAt(draft.updatedAt || Date.now());
                            setResumeDraft(draft);
                            setIsLoading(false);
                            return;
                        }
                    }
                    beginFreshWizard();
                    return;
                }
                setSaveError(error.message || "Nie udało się pobrać szkicu.");
                readyRef.current = true;
                setIsReady(true);
            } finally {
                if (active) setIsLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [beginFreshWizard, createApi, finalStep, isBioCvModal]);

    useEffect(() => {
        if (!isReady || !isBioCvModal || resumeDraft) return undefined;
        if (skipAutosaveRef.current) {
            skipAutosaveRef.current = false;
            return undefined;
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveTimer.current = null;
            saveDraft(profile, { silent: true, stepOverride: step });
        }, 650);
        return () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
        };
    }, [isBioCvModal, isReady, profile, resumeDraft, saveDraft, step]);

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
        setEditingKey((current) => {
            if (!current || !current.startsWith(`${field}:`)) return current;
            const editingIndex = Number(current.split(":")[1]);
            if (editingIndex === index) return null;
            if (editingIndex > index) return `${field}:${editingIndex - 1}`;
            return current;
        });
    }, [updateProfile]);

    const moveListItem = useCallback((field, index, direction) => {
        updateProfile((current) => {
            const target = index + direction;
            if (target < 0 || target >= current[field].length) return current;
            const next = [...current[field]];
            [next[index], next[target]] = [next[target], next[index]];
            return { ...current, [field]: next };
        });
        setEditingKey((current) => {
            if (current === `${field}:${index}`) return `${field}:${index + direction}`;
            if (current === `${field}:${index + direction}`) return `${field}:${index}`;
            return current;
        });
    }, [updateProfile]);

    const addListItem = useCallback((field, factory) => {
        const nextIndex = profileRef.current[field].length;
        updateProfile((current) => ({
            ...current,
            [field]: [...current[field], factory()],
        }));
        setEditingKey(`${field}:${nextIndex}`);
    }, [updateProfile]);

    const finishEditing = useCallback((field, index) => {
        const entry = profile[field]?.[index];
        if (!entry) {
            setEditingKey(null);
            return;
        }
        if (field === "experience" && entryHasValues(entry) && (!entry.company || !entry.title)) {
            setStepError("Przy każdym stanowisku podaj pracodawcę i nazwę stanowiska.");
            return;
        }
        if (field === "education" && entryHasValues(entry) && (!entry.school || !entry.degree)) {
            setStepError("Przy każdej edukacji podaj uczelnię i dyplom lub kierunek.");
            return;
        }
        if (field === "languages" && entry.level && !entry.name) {
            setStepError("Wpisz język albo usuń pusty wiersz.");
            return;
        }
        if (field === "custom_sections" && entryHasValues(entry) && (!entry.title || !entry.items.length)) {
            setStepError("Sekcja własna potrzebuje tytułu i co najmniej jednej pozycji.");
            return;
        }
        if (!entryHasValues(entry)) {
            removeListItem(field, index);
            setEditingKey(null);
            setStepError(null);
            return;
        }
        setStepError(null);
        setEditingKey(null);
    }, [profile, removeListItem]);

    const goNext = useCallback(() => {
        const error = validateBioCvStep(step, profile);
        if (error) {
            setStepError(error);
            return;
        }
        setStepError(null);
        setEditingKey(null);
        setShowTypePicker(false);
        setStep((current) => Math.min(current + 1, finalStep));
    }, [finalStep, profile, step]);

    const jumpToSummary = useCallback(() => {
        const error = getBioCvSummaryJumpError(profile);
        if (error) {
            setStepError(error);
            return;
        }
        setStepError(null);
        setEditingKey(null);
        setShowTypePicker(false);
        setStep(finalStep);
    }, [finalStep, profile]);

    const canJumpSummary = canJumpToBioCvSummary(profile);
    const stepValidationError = validateBioCvStep(step, profile);
    const canGoNext = !stepValidationError;

    const handleClose = useCallback(async () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        // Flush while the wizard was editable. On the resume prompt the draft
        // is already on disk and profile mirrors it — skip to avoid racing the
        // "Zacznij od nowa" clear path.
        if (readyRef.current && !resumeDraft) {
            await saveDraft(profileRef.current, { silent: true });
            // Guests also write synchronously so a dialog unmount cannot drop
            // the last keystrokes if the serial queue has not drained yet.
            if (!getAccessToken()) {
                saveGuestWizardDraft({
                    step: stepRef.current,
                    profile: profileRef.current,
                    selectedTemplateId: selectedTemplateIdRef.current,
                });
            }
        }
        // Distinct from the plain open/close toggle: this is the user's own
        // Cancel/X action, so it is the only path allowed to redirect a guest
        // back to the landing page when the wizard was their direct entry
        // point and nothing has been filled yet — see `handleCancelBioCvModal`
        // in PdfCanvas.jsx for why a successful fill must never go through it.
        cancelBioCvModal();
    }, [resumeDraft, saveDraft, cancelBioCvModal]);

    const clearDraft = useCallback(async () => {
        if (!window.confirm("Wyczyścić wszystkie dane zapisane w szkicu CV?")) return;
        setMenuOpen(false);
        if (!getAccessToken()) {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
            clearGuestWizardDraft();
            beginFreshWizard();
            return;
        }
        try {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
            }
            await saveQueueRef.current.whenIdle();
            await createApi().httpRequest(ENDPOINTS.AI.BIO_CV_DRAFT, "DELETE", null, "Nie udało się usunąć szkicu.");
            clearGuestWizardDraft();
            beginFreshWizard();
        } catch (error) {
            if (isAuthFailure(error)) {
                clearAccessToken();
                clearGuestWizardDraft();
                setIsGuestSession(true);
                beginFreshWizard();
                return;
            }
            setSaveError(error.message || "Nie udało się usunąć szkicu.");
        }
    }, [beginFreshWizard, createApi]);

    const handleFill = useCallback(async (template) => {
        if (!isTemplateAllowed(template, entitlements)) {
            setSaveError("Ten szablon jest dostępny w planie Pro.");
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
        selectedTemplateIdRef.current = template.id;
        setSelectedTemplateId(template.id);
        try {
            const payload = buildBioCvPayload(profile);
            await saveDraft(payload, { silent: true, stepOverride: BIO_CV_SUMMARY_STEP });
            const response = await fillTemplate(payload, template.id, {
                errorMessage: "Nie udało się utworzyć CV.",
                spacing: flowSpacing,
            });
            await loadAiElements(response.elements, `CV ${template.name}`, template.id);
            setActiveCvData(payload);
            showBioCvModal();
        } catch (error) {
            if (isAuthFailure(error)) {
                clearAccessToken();
                setIsGuestSession(true);
                setSaveError(null);
                return;
            }
            setSaveError(planErrorMessage(error, "Nie udało się utworzyć CV."));
        } finally {
            setFillingId(null);
        }
    }, [entitlements, flowSpacing, loadAiElements, profile, saveDraft, setActiveCvData, showBioCvModal]);

    const handleWizardComplete = useCallback(async () => {
        // Revalidate every step before handoff because users can navigate back
        // and edit earlier cards without passing through the normal Next action.
        const invalidStep = wizardSteps
            .map((_, index) => validateBioCvStep(index, profile))
            .findIndex(Boolean);
        if (invalidStep !== -1) {
            setStep(invalidStep);
            setStepError(validateBioCvStep(invalidStep, profile));
            return;
        }
        const payload = buildBioCvPayload(profile);
        const conversionIntent = isDemoConversion ? "demo-conversion" : "wizard-conversion";
        setSaveError(null);
        try {
            if (!getAccessToken()) {
                saveGuestWizardDraft({
                    step: finalStep,
                    profile: payload,
                    selectedTemplateId: "regent",
                });
                localStorage.setItem("cvstudio.wizardConversionPending", conversionIntent);
                navigate(`/register?start=${conversionIntent}`);
                return;
            }
            setIsLoading(true);
            await saveDraft(payload, { silent: true, stepOverride: finalStep });
            const response = await fillTemplate(payload, "regent", {
                errorMessage: "Nie udało się utworzyć CV.",
                spacing: flowSpacing,
            });
            await loadAiElements(response.elements, "Moje CV", "regent");
            setActiveCvData(payload);
            showBioCvModal();
        } catch (error) {
            if (isAuthFailure(error)) {
                clearAccessToken();
                setIsGuestSession(true);
                saveGuestWizardDraft({ step: finalStep, profile: payload, selectedTemplateId: "regent" });
                localStorage.setItem("cvstudio.wizardConversionPending", conversionIntent);
                navigate(`/register?start=${conversionIntent}`);
                return;
            }
            setSaveError(error.message || "Nie udało się utworzyć CV.");
        } finally {
            setIsLoading(false);
        }
    }, [finalStep, flowSpacing, isDemoConversion, loadAiElements, navigate, profile, saveDraft, setActiveCvData, showBioCvModal, wizardSteps]);

    const addCustomFromPreset = useCallback((preset) => {
        const nextIndex = profileRef.current.custom_sections.length;
        updateProfile((current) => ({
            ...current,
            custom_sections: [...current.custom_sections, createCustomSectionFromPreset(preset)],
        }));
        setEditingKey(`custom_sections:${nextIndex}`);
        setShowTypePicker(false);
    }, [updateProfile]);

    const extraContactKinds = availableExtraContactKinds(profile);

    const renderPersonal = () => (
        <div className={classes.formGrid}>
            <TextField label="Imię i nazwisko *" value={profile.name} onChange={(name) => updateProfile({ ...profile, name })} placeholder="np. Anna Kowalska" />
            <TextField label="Stanowisko docelowe" value={profile.title} onChange={(title) => updateProfile({ ...profile, title })} placeholder="np. Product Manager" />
            <TextField label="Adres / lokalizacja" value={profile.address} onChange={(address) => updateProfile({ ...profile, address })} placeholder="np. Warszawa, Polska" />
            <TextField label="Telefon" value={profile.phone} onChange={(phone) => updateProfile({ ...profile, phone })} placeholder="+48 500 000 000" type="tel" />
            <TextField label="E-mail" value={profile.email} onChange={(email) => updateProfile({ ...profile, email })} placeholder="anna@example.com" type="email" full />
            <TextField
                label="LinkedIn"
                value={profile.linkedin}
                onChange={(linkedin) => updateProfile({ ...profile, linkedin })}
                placeholder="linkedin.com/in/anna-kowalska"
                full
            />
            {profile.github ? (
                <label className={`${classes.field} ${classes.full}`}>
                    <span>GitHub</span>
                    <div className={classes.linkFieldRow}>
                        <input
                            type="url"
                            value={profile.github}
                            placeholder="github.com/anna"
                            onChange={(event) => updateProfile({ ...profile, github: event.target.value })}
                        />
                        <button
                            type="button"
                            className={classes.removeBtn}
                            onClick={() => updateProfile({ ...profile, github: "" })}
                        >
                            Usuń
                        </button>
                    </div>
                </label>
            ) : null}
            {profile.website ? (
                <label className={`${classes.field} ${classes.full}`}>
                    <span>Strona WWW</span>
                    <div className={classes.linkFieldRow}>
                        <input
                            type="url"
                            value={profile.website}
                            placeholder="anna.example.com"
                            onChange={(event) => updateProfile({ ...profile, website: event.target.value })}
                        />
                        <button
                            type="button"
                            className={classes.removeBtn}
                            onClick={() => updateProfile({ ...profile, website: "" })}
                        >
                            Usuń
                        </button>
                    </div>
                </label>
            ) : null}
            {extraContactKinds.length > 0 ? (
                <div className={`${classes.linkAddRow} ${classes.full}`}>
                    <span className={classes.linkAddLabel}>Dodaj link</span>
                    <div className={classes.linkAddActions}>
                        {extraContactKinds.map((option) => (
                            <button
                                key={option.kind}
                                type="button"
                                className={classes.addBtn}
                                onClick={() => updateProfile({
                                    ...profile,
                                    [option.kind]: option.kind === "github"
                                        ? "github.com/"
                                        : "https://",
                                })}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
            <label className={`${classes.field} ${classes.full}`}>
                <span>Podsumowanie zawodowe (opcjonalne)</span>
                <textarea
                    value={profile.summary}
                    rows="4"
                    placeholder="2–3 zdania o doświadczeniu, specjalizacji i celu zawodowym. Możesz dodać je później."
                    onChange={(event) => updateProfile({ ...profile, summary: event.target.value })}
                />
                <button type="button" className={classes.textLink} onClick={goNext}>
                    Pomiń na razie
                </button>
            </label>
        </div>
    );

    const renderExperienceEditor = (entry, index) => (
        <section className={classes.entryCard} key={`experience-edit-${index}`}>
            <div className={classes.cardHeader}>
                <strong>Miejsce pracy</strong>
                <div className={classes.cardActions}>
                    <button type="button" className={classes.editBtn} onClick={() => finishEditing("experience", index)}>Gotowe</button>
                    <button type="button" className={classes.removeBtn} onClick={() => removeListItem("experience", index)}>Usuń</button>
                </div>
            </div>
            <div className={classes.formGrid}>
                <TextField label="Stanowisko *" value={entry.title} onChange={(title) => updateListItem("experience", index, { title })} placeholder="np. Senior Developer" />
                <TextField label="Pracodawca *" value={entry.company} onChange={(company) => updateListItem("experience", index, { company })} placeholder="Nazwa firmy" />
                <TextField label="Miasto" value={entry.city} onChange={(city) => updateListItem("experience", index, { city })} placeholder="np. Kraków" />
                <TextField label="Okres" value={entry.period} onChange={(period) => updateListItem("experience", index, { period })} placeholder="2022 – obecnie" />
                <div className={classes.full}>
                    <ListTextarea
                        label="Co tam robiłeś?"
                        items={entry.bullets}
                        onCommit={(bullets) => updateListItem("experience", index, { bullets })}
                        placeholder={"Dodaj 2–5 osiągnięć lub obowiązków.\nnp. Zwiększyłem konwersję formularza o 20%."}
                    />
                </div>
            </div>
        </section>
    );

    const renderExperience = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Dodaj ostatnie miejsca pracy. Zacznij od najnowszego. W opisie wpisz najważniejsze obowiązki albo osiągnięcia.</p>
            {profile.experience.map((entry, index) => (
                editingKey === `experience:${index}`
                    ? renderExperienceEditor(entry, index)
                    : (
                        <CompactCard
                            key={`experience-${index}`}
                            title={entry.title || "Nowe stanowisko"}
                            subtitle={entry.company}
                            meta={[entry.city, entry.period].filter(Boolean).join(" · ")}
                            onEdit={() => setEditingKey(`experience:${index}`)}
                            onRemove={() => removeListItem("experience", index)}
                            onMoveUp={() => moveListItem("experience", index, -1)}
                            onMoveDown={() => moveListItem("experience", index, 1)}
                            canMoveUp={index > 0}
                            canMoveDown={index < profile.experience.length - 1}
                        />
                    )
            ))}
            <button type="button" className={classes.addBtn} onClick={() => addListItem("experience", createExperience)}>
                + Dodaj miejsce pracy
            </button>
        </div>
    );

    const renderEducationEditor = (entry, index) => (
        <section className={classes.entryCard} key={`education-edit-${index}`}>
            <div className={classes.cardHeader}>
                <strong>Szkoła / uczelnia</strong>
                <div className={classes.cardActions}>
                    <button type="button" className={classes.editBtn} onClick={() => finishEditing("education", index)}>Gotowe</button>
                    <button type="button" className={classes.removeBtn} onClick={() => removeListItem("education", index)}>Usuń</button>
                </div>
            </div>
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
    );

    const renderEducation = () => (
        <div className={classes.repeater}>
            <p className={classes.intro}>Dodaj szkołę lub uczelnię wraz z kierunkiem i najważniejszymi informacjami.</p>
            {profile.education.map((entry, index) => (
                editingKey === `education:${index}`
                    ? renderEducationEditor(entry, index)
                    : (
                        <CompactCard
                            key={`education-${index}`}
                            title={entry.degree || "Nowa edukacja"}
                            subtitle={entry.school}
                            meta={[entry.city, entry.period].filter(Boolean).join(" · ")}
                            onEdit={() => setEditingKey(`education:${index}`)}
                            onRemove={() => removeListItem("education", index)}
                            onMoveUp={() => moveListItem("education", index, -1)}
                            onMoveDown={() => moveListItem("education", index, 1)}
                            canMoveUp={index > 0}
                            canMoveDown={index < profile.education.length - 1}
                        />
                    )
            ))}
            <button type="button" className={classes.addBtn} onClick={() => addListItem("education", createEducation)}>
                + Dodaj szkołę lub uczelnię
            </button>
        </div>
    );

    const renderLanguageEditor = (entry, index) => (
        <section className={classes.entryCard} key={`language-edit-${index}`}>
            <div className={classes.cardHeader}>
                <strong>Język</strong>
                <div className={classes.cardActions}>
                    <button type="button" className={classes.editBtn} onClick={() => finishEditing("languages", index)}>Gotowe</button>
                    <button type="button" className={classes.removeBtn} onClick={() => removeListItem("languages", index)}>Usuń</button>
                </div>
            </div>
            <div className={classes.formGrid}>
                <TextField label="Język" value={entry.name} onChange={(name) => updateListItem("languages", index, { name })} placeholder="np. Angielski" />
                <LanguageLevelSelect
                    value={entry.level}
                    onChange={(level) => updateListItem("languages", index, { level })}
                />
            </div>
        </section>
    );

    const renderCustomEditor = (section, index) => (
        <section className={classes.entryCard} key={`custom-edit-${index}`}>
            <div className={classes.cardHeader}>
                <strong>{section.title || "Nowa sekcja"}</strong>
                <div className={classes.cardActions}>
                    <button type="button" className={classes.editBtn} onClick={() => finishEditing("custom_sections", index)}>Gotowe</button>
                    <button type="button" className={classes.removeBtn} onClick={() => removeListItem("custom_sections", index)}>Usuń</button>
                </div>
            </div>
            <div className={classes.formGrid}>
                <TextField
                    label="Tytuł sekcji *"
                    value={section.title}
                    onChange={(title) => updateListItem("custom_sections", index, { title })}
                    placeholder="np. Certyfikaty"
                    full
                />
                {!section.title && <small className={classes.inlineHint}>Dodaj nazwę sekcji</small>}
                <div className={classes.full}>
                    <ListTextarea
                        label="Pozycje *"
                        items={section.items}
                        onCommit={(items) => updateListItem("custom_sections", index, { items })}
                        placeholder={"Nazwa projektu — kontekst\nOpis punktu 1\nOpis punktu 2"}
                    />
                    {!section.items.length && <small className={classes.inlineHint}>Dodaj przynajmniej jeden wpis</small>}
                </div>
            </div>
        </section>
    );

    const renderExtras = () => (
        <div className={classes.extrasStep}>
            <section className={classes.extrasBlock}>
                <h4>Umiejętności</h4>
                <p className={classes.intro}>
                    Dodaj umiejętności w osobnych liniach. Podsekcje zapisuj jako
                    „Kategoria: chip, chip” — na CV pojawią się pod nagłówkiem UMIEJĘTNOŚCI.
                </p>
                <ListTextarea
                    items={profile.skills}
                    onCommit={(skills) => updateProfile({ ...profile, skills })}
                    parse={parseSkills}
                    placeholder={"Bezpieczeństwo: Wireshark, Nmap, SIEM\nPrzemysł / OT: PLC, RFID\nPython\nSQL"}
                    label="Lista umiejętności"
                    hint="Każdy punkt lub podsekcję „Kategoria: …” wpisz w osobnej linii."
                />
            </section>

            <section className={classes.extrasBlock}>
                <h4>Języki</h4>
                <p className={classes.intro}>Poziom jest opcjonalny, ale pomaga rekruterowi szybko ocenić znajomość języka.</p>
                <div className={classes.repeater}>
                    {profile.languages.map((entry, index) => (
                        editingKey === `languages:${index}`
                            ? renderLanguageEditor(entry, index)
                            : (
                                <CompactCard
                                    key={`language-${index}`}
                                    title={entry.name || "Nowy język"}
                                    subtitle={entry.level}
                                    onEdit={() => setEditingKey(`languages:${index}`)}
                                    onRemove={() => removeListItem("languages", index)}
                                    onMoveUp={() => moveListItem("languages", index, -1)}
                                    onMoveDown={() => moveListItem("languages", index, 1)}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < profile.languages.length - 1}
                                />
                            )
                    ))}
                    <button type="button" className={classes.addBtn} onClick={() => addListItem("languages", createLanguage)}>
                        + Dodaj język
                    </button>
                </div>
            </section>

            <section className={classes.extrasBlock}>
                <h4>Co jeszcze chcesz pokazać?</h4>
                <p className={classes.intro}>Wybierz typ sekcji. Kolejność w CV możesz później zmienić w edytorze.</p>
                <div className={classes.repeater}>
                    {profile.custom_sections.map((section, index) => (
                        editingKey === `custom_sections:${index}`
                            ? renderCustomEditor(section, index)
                            : (
                                <CompactCard
                                    key={`custom-${index}`}
                                    title={section.title || "Nowa sekcja"}
                                    subtitle={section.kind === "other" ? "Sekcja własna" : section.kind}
                                    meta={`${section.items.length} pozycji`}
                                    onEdit={() => setEditingKey(`custom_sections:${index}`)}
                                    onRemove={() => removeListItem("custom_sections", index)}
                                    onMoveUp={() => moveListItem("custom_sections", index, -1)}
                                    onMoveDown={() => moveListItem("custom_sections", index, 1)}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < profile.custom_sections.length - 1}
                                />
                            )
                    ))}
                </div>
                {showTypePicker ? (
                    <div className={classes.typePicker}>
                        {CUSTOM_SECTION_PRESETS.map((preset) => (
                            <button
                                type="button"
                                key={`${preset.kind}-${preset.title}`}
                                className={classes.typeChip}
                                onClick={() => addCustomFromPreset(preset)}
                            >
                                {preset.title}
                            </button>
                        ))}
                        <button type="button" className={classes.textLink} onClick={() => setShowTypePicker(false)}>
                            Anuluj
                        </button>
                    </div>
                ) : (
                    <button type="button" className={classes.addBtn} onClick={() => setShowTypePicker(true)}>
                        + Dodaj sekcję
                    </button>
                )}
            </section>
            {isGuestOnboarding && (
            <section className={classes.review}>
                <h3>Wszystko gotowe</h3>
                <p>
                    {!hasAuthenticatedSession
                        ? "Utwórz bezpłatne konto, aby wygenerować CV i przejść do edytora."
                        : "Wygeneruj swoje CV i przejdź do pełnego edytora."}
                </p>
                <p className={classes.inlineHint}>
                    {!hasAuthenticatedSession
                        ? "Twoje dane z kreatora zostaną zachowane."
                        : "Regent zostanie wygenerowany na podstawie wprowadzonych danych."}
                </p>
                <button type="button" className={classes.primaryBtn} onClick={handleWizardComplete}>
                    {!hasAuthenticatedSession ? "Utwórz konto i moje CV" : "Utwórz moje CV"}
                </button>
            </section>
            )}
        </div>
    );
    const renderReview = () => (
        <div className={classes.review}>
            <div className={classes.reviewIdentity}>
                <strong>{profile.name || "Twoje CV"}</strong>
                {profile.title && <span>{profile.title}</span>}
            </div>
            <div className={classes.reviewStats}>
                <span>{profile.experience.filter(entryHasValues).length} doświadczeń</span>
                <span>{profile.education.filter(entryHasValues).length} wpisów edukacji</span>
                <span>{profile.skills.length} umiejętności</span>
                <span>{profile.languages.filter((entry) => entry.name).length} języków</span>
                <span>{profile.custom_sections.filter((section) => section.title && section.items.length).length} sekcji własnych</span>
            </div>
            <p>Wybierz wygląd swojego CV, a następnie utwórz dokument w pełnym edytorze.</p>
            <div className={classes.carouselSection}>
                <TemplateCarousel
                    templates={cvTemplates}
                    entitlements={entitlements}
                    fillingId={fillingId}
                    onSelect={handleFill}
                    visibleCount={5}
                    actionLabel="Utwórz moje CV"
                />
            </div>
        </div>
    );

    const content = (isGuestOnboarding
        ? [renderPersonal, renderExperience, renderEducation, renderExtras]
        : [renderPersonal, renderExperience, renderEducation, renderExtras, renderReview]
    )[step]?.();

    const progressPercent = ((step + 1) / wizardSteps.length) * 100;
    const savedClock = formatSavedAt(lastSavedAt);
    const saveStatus = (() => {
        if (isSaving) return "Zapisywanie…";
        if (!isReady || saveError || resumeDraft) return null;
        if (!lastSavedAt) return null;
        if (isGuestSession) {
            return savedClock
                ? `Zapisano na tym urządzeniu · ${savedClock}`
                : "Zapisano na tym urządzeniu";
        }
        return savedClock ? `Zapisano · ${savedClock}` : "Zapisano";
    })();

    const optionalStep = step >= 1 && step < finalStep;

    if (resumeDraft) {
        return (
            <DialogShell
                open={isBioCvModal}
                onClose={handleClose}
                variant="fullscreen"
                title="CV Studio"
                subtitle="Masz niedokończone CV na tym urządzeniu."
            >
                <div className={classes.resumePanel}>
                    <h3>Masz niedokończone CV</h3>
                    <p>
                        Ostatni zapis
                        {resumeDraft.updatedAt ? ` ${formatSavedAt(resumeDraft.updatedAt)}` : ""}
                        . Możesz kontynuować od kroku {resumeDraft.step + 1} ({wizardSteps[resumeDraft.step] || "Podstawowe dane"}).
                    </p>
                    <div className={classes.resumeActions}>
                        <button type="button" className={classes.primaryBtn} onClick={() => beginFromDraft(resumeDraft)}>
                            Kontynuuj od kroku {resumeDraft.step + 1}
                        </button>
                        <button
                            type="button"
                            className={classes.cancelBtn}
                            onClick={() => {
                                clearGuestWizardDraft();
                                beginFreshWizard();
                            }}
                        >
                            Zacznij od nowa
                        </button>
                    </div>
                </div>
            </DialogShell>
        );
    }

    return (
        <DialogShell
            open={isBioCvModal}
            onClose={handleClose}
            variant="fullscreen"
            title="CV Studio"
            subtitle={`Krok ${step + 1} z ${wizardSteps.length} · ${wizardSteps[step]}`}
            footer={(
                <div className={classes.footer}>
                    <div className={classes.draftState}>
                        <span>Krok {step + 1} z {wizardSteps.length}</span>
                        {saveStatus && <em>{saveStatus}</em>}
                    </div>
                    <div className={classes.footerActions}>
                        <div className={classes.menuWrap} ref={menuRef}>
                            <button
                                type="button"
                                className={classes.menuBtn}
                                aria-label="Więcej opcji"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((open) => !open)}
                            >
                                ···
                            </button>
                            {menuOpen && (
                                <div className={classes.menuDropdown} role="menu">
                                    <button type="button" role="menuitem" className={classes.menuDanger} onClick={clearDraft}>
                                        Wyczyść wszystkie dane
                                    </button>
                                </div>
                            )}
                        </div>
                        {step > 0 && (
                            <button
                                type="button"
                                className={classes.cancelBtn}
                                onClick={() => {
                                    setStep((current) => current - 1);
                                    setStepError(null);
                                    setEditingKey(null);
                                    setShowTypePicker(false);
                                }}
                            >
                                Wstecz
                            </button>
                        )}
                        {optionalStep && (
                            <button
                                type="button"
                                className={classes.textLinkBtn}
                                onClick={goNext}
                                disabled={!canGoNext}
                            >
                                Pomiń ten krok
                            </button>
                        )}
                        {step < finalStep && (
                            <button
                                type="button"
                                className={classes.primaryBtn}
                                onClick={goNext}
                                disabled={!canGoNext}
                            >
                                Dalej
                            </button>
                        )}
                    </div>
                </div>
            )}
        >
            <div className={classes.wizardInner}>
                <div className={classes.progressBlock} aria-label={`Krok ${step + 1}: ${wizardSteps[step]}`}>
                    <div className={classes.progressMeta}>
                        <span>{`Krok ${step + 1} z ${wizardSteps.length} · ${wizardSteps[step]}`}</span>
                        <span className={classes.progressLabels}>
                            {wizardSteps.map((label, index) => (
                                <button
                                    type="button"
                                    key={label}
                                    className={`${classes.progressLabel} ${index === step ? classes.activeLabel : ""} ${index < step ? classes.completeLabel : ""}`}
                                    onClick={() => {
                                        if (index < step) {
                                            setStep(index);
                                            setStepError(null);
                                            setEditingKey(null);
                                            setShowTypePicker(false);
                                            return;
                                        }
                                        if (index === finalStep && canJumpSummary) {
                                            jumpToSummary();
                                        }
                                    }}
                                    disabled={index > step && !(index === finalStep && canJumpSummary)}
                                >
                                    {label}
                                </button>
                            ))}
                        </span>
                    </div>
                    <div className={classes.progressTrack} aria-hidden="true">
                        <div className={classes.progressFill} style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>

                <section className={classes.body}>
                    <div className={classes.sectionHeading}>
                        <span>Etap {step + 1}</span>
                        <h3>{wizardSteps[step]}</h3>
                    </div>
                    {isLoading ? <p className={classes.loading}>Odtwarzanie zapisanego szkicu…</p> : content}
                    {stepError && <div className={classes.error}>{stepError}</div>}
                    {saveError && <div className={classes.error}>{saveError}</div>}
                </section>
            </div>
        </DialogShell>
    );
}
