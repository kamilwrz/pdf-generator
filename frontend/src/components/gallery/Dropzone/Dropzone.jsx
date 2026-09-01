/**
 * Profile-photo upload dropzone.
 *
 * Default (dialog) variant keeps the standalone upload surface. The `embedded`
 * variant fills the lower third of the gallery panel: each successful upload
 * reports the new row via `onUploaded` so the parent can fill a slot immediately.
 */
import classes from "./Dropzone.module.css";
import { useDropzone } from "react-dropzone";
import { useState, useEffect, useCallback, useRef } from "react";

import Progress from "../../common/Progress/Progress";

import { useUiSurfaces } from "../../../store/ui-surfaces-context";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import {
    polishUploadResultMessage,
    polishUploadingMessage,
} from "../../../utils/polishUploadMessage";
import { MAX_PROFILE_PHOTOS } from "../../../constants/profilePhotos";

const PROGRESS_MAX = 100;
const LIMIT_FULL_MESSAGE =
    `Osiągnięto limit ${MAX_PROFILE_PHOTOS} zdjęć profilowych. `
    + "Usuń jedno lub więcej zdjęć w galerii, aby dodać kolejne.";

/**
 * @param {{
 *   variant?: "dialog" | "embedded",
 *   active?: boolean,
 *   libraryCount?: number,
 *   onUploaded?: (row: { id: number, filename?: string, mime_type?: string }) => void | Promise<void>,
 *   onLibraryChange?: (info: { libraryCount: number; batchCount: number; remainingSlots: number }) => void,
 * }} props
 */
export default function Dropzone({
    variant = "dialog",
    active,
    libraryCount: libraryCountProp,
    onUploaded,
    onLibraryChange,
}) {
    const { valueImageUpload, setValueImageUpload, isDropzone } = useUiSurfaces();
    const isEmbedded = variant === "embedded";
    const isActive = active ?? isDropzone;

    const [files, setFiles] = useState([]);
    const [libraryCount, setLibraryCount] = useState(libraryCountProp ?? 0);
    const [libraryLoaded, setLibraryLoaded] = useState(libraryCountProp != null);
    const [status, setStatus] = useState("idle"); // idle | uploading | success | error
    const [statusMessage, setStatusMessage] = useState("");
    const uploadTokenRef = useRef(0);

    // Parent-owned count (gallery) wins when provided.
    useEffect(() => {
        if (libraryCountProp == null) return;
        setLibraryCount(libraryCountProp);
        setLibraryLoaded(true);
    }, [libraryCountProp]);

    const remainingSlots = Math.max(0, MAX_PROFILE_PHOTOS - libraryCount);
    const atLimit = libraryLoaded && remainingSlots === 0;

    useEffect(() => {
        onLibraryChange?.({
            libraryCount,
            batchCount: files.length,
            remainingSlots,
        });
    }, [libraryCount, files.length, remainingSlots, onLibraryChange]);

    const refreshLibraryCount = useCallback(async () => {
        if (libraryCountProp != null) return;
        if (!localStorage.getItem("token")) {
            setLibraryCount(0);
            setLibraryLoaded(true);
            return;
        }
        const api = new ApiClient({
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        });
        try {
            const rows = await api.httpRequest(
                ENDPOINTS.IMG.FETCH,
                "GET",
                null,
                "Pobieranie zdjęć profilowych nie powiodło się!",
            );
            setLibraryCount(Array.isArray(rows) ? rows.length : 0);
        } catch {
            // Keep the previous count on transient failures.
        } finally {
            setLibraryLoaded(true);
        }
    }, [libraryCountProp]);

    useEffect(() => {
        if (!isActive) return undefined;
        setStatus("idle");
        setStatusMessage("");
        setFiles((prev) => {
            prev.forEach((file) => URL.revokeObjectURL(file.preview));
            return [];
        });
        setValueImageUpload(0);
        if (libraryCountProp == null) {
            setLibraryLoaded(false);
            refreshLibraryCount();
        }
        return undefined;
    }, [isActive, refreshLibraryCount, setValueImageUpload, libraryCountProp]);

    const onDrop = useCallback((acceptedFiles) => {
        if (!acceptedFiles?.length) return;

        if (!localStorage.getItem("token")) {
            setStatus("error");
            setStatusMessage("Załóż konto, aby przesyłać zdjęcia profilowe do galerii.");
            return;
        }

        if (remainingSlots <= 0) {
            setStatus("error");
            setStatusMessage(LIMIT_FULL_MESSAGE);
            return;
        }

        const capped = acceptedFiles.slice(0, remainingSlots);
        const truncated = capped.length < acceptedFiles.length;

        const token = ++uploadTokenRef.current;
        const batch = capped.map((file) => Object.assign(file, {
            preview: URL.createObjectURL(file),
        }));

        setFiles((prev) => {
            prev.forEach((file) => URL.revokeObjectURL(file.preview));
            return batch;
        });
        setStatus("uploading");
        setStatusMessage(
            truncated
                ? `Wybrano więcej plików niż wolnych miejsc — przesyłanie ${batch.length} ${batch.length === 1 ? "zdjęcia" : "zdjęć"}…`
                : polishUploadingMessage(batch.length),
        );
        setValueImageUpload(0);

        const api = new ApiClient({
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        });

        // Sequential uploads so each finished file can fill a gallery slot
        // before the next request starts (live UI update).
        (async () => {
            let succeeded = 0;
            let lastErrorMessage = "";
            const total = batch.length;
            for (let index = 0; index < batch.length; index += 1) {
                if (token !== uploadTokenRef.current) return;
                const file = batch[index];
                const formData = new FormData();
                formData.append("file", file);
                try {
                    const result = await api.httpRequest(
                        ENDPOINTS.IMG.UPLOAD,
                        "POST",
                        formData,
                        "Przesyłanie zdjęcia profilowego nie powiodło się!",
                    );
                    succeeded += 1;
                    if (libraryCountProp == null) {
                        setLibraryCount((prev) => prev + 1);
                    }
                    if (result?.id != null) {
                        await onUploaded?.(result);
                    }
                } catch (err) {
                    if (err?.message) lastErrorMessage = err.message;
                }
                if (token !== uploadTokenRef.current) return;
                setValueImageUpload(Math.round(((index + 1) / total) * PROGRESS_MAX));
            }
            if (token !== uploadTokenRef.current) return;
            const summary = polishUploadResultMessage(succeeded, total);
            const message = succeeded === 0 && lastErrorMessage
                ? lastErrorMessage
                : summary;
            if (message) setStatusMessage(message);
            setStatus(succeeded === 0 ? "error" : "success");
            setValueImageUpload(PROGRESS_MAX);
            if (succeeded > 0 && libraryCountProp == null) {
                await refreshLibraryCount();
            }
        })();
    }, [
        remainingSlots,
        refreshLibraryCount,
        setValueImageUpload,
        onUploaded,
        libraryCountProp,
    ]);

    const dropDisabled = status === "uploading" || atLimit || !libraryLoaded;

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { "image/*": [] },
        maxFiles: Math.max(remainingSlots, 0),
        disabled: dropDisabled,
        onDrop,
        onDropRejected: () => {
            if (atLimit) {
                setStatus("error");
                setStatusMessage(LIMIT_FULL_MESSAGE);
            }
        },
    });

    useEffect(() => () => {
        files.forEach((file) => URL.revokeObjectURL(file.preview));
    }, [files]);

    const showProgress = status === "uploading" || status === "success" || status === "error";

    let title = isEmbedded ? "Upuść zdjęcie tutaj" : "Upuść zdjęcia profilowe tutaj";
    let hint = <>lub <span>przeglądaj pliki</span></>;
    if (!libraryLoaded) {
        title = "Sprawdzanie limitu…";
        hint = `Maksymalnie ${MAX_PROFILE_PHOTOS} zdjęć`;
    } else if (atLimit) {
        title = "Limit jest pełny";
        hint = LIMIT_FULL_MESSAGE;
    } else if (status === "uploading") {
        title = "Przesyłanie…";
        hint = statusMessage;
    } else if (isDragActive) {
        title = "Upuść, aby przesłać";
        hint = `Pozostało ${remainingSlots} z ${MAX_PROFILE_PHOTOS}`;
    } else if (isEmbedded) {
        hint = (
            <>
                lub <span>przeglądaj</span>
                {" · "}
                {remainingSlots}
                /
                {MAX_PROFILE_PHOTOS}
            </>
        );
    } else {
        hint = (
            <>
                lub <span>przeglądaj pliki</span>
                {" · "}
                pozostało
                {" "}
                {remainingSlots}
                {" "}
                z
                {" "}
                {MAX_PROFILE_PHOTOS}
                {" "}
                miejsc
            </>
        );
    }

    return (
        <section className={`${classes.dropzoneContainer}${isEmbedded ? ` ${classes.embedded}` : ""}`}>
            {!isEmbedded ? (
                <p className={classes.intro}>
                    Prześlij zdjęcia profilowe, które chcesz używać w CV.
                    Biblioteka mieści maksymalnie
                    {" "}
                    {MAX_PROFILE_PHOTOS}
                    {" "}
                    zdjęcia.
                </p>
            ) : null}

            <div
                {...getRootProps({
                    className: `${classes.dropzone}${atLimit ? ` ${classes.dropzoneDisabled}` : ""}${isDragActive ? ` ${classes.dropzoneActive}` : ""}`,
                })}
                aria-disabled={dropDisabled}
            >
                <input {...getInputProps()} />
                <div className={classes.dropIcon}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--chrome-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8" /><path d="m8 17 4-4 4 4" /><path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15" /></svg>
                </div>
                <div className={classes.dropTitle}>{title}</div>
                <div className={classes.dropHint}>{hint}</div>
            </div>

            {atLimit && !isEmbedded ? (
                <p className={classes.limitBanner} role="status">
                    {LIMIT_FULL_MESSAGE}
                </p>
            ) : null}

            {!isEmbedded && isActive && files.length > 0 && (
                <>
                    <div className={classes.divider}>
                        <span className={classes.dividerLine} />
                        <span className={classes.dividerLabel}>Podgląd przed zapisem w galerii</span>
                        <span className={classes.dividerLine} />
                    </div>
                    <aside className={classes.thumbsWrap} aria-label="Podgląd przesyłanych zdjęć profilowych">
                        {files.map((file) => (
                            <div className={classes.thumb} key={`${file.name}-${file.size}-${file.lastModified}`}>
                                <img
                                    src={file.preview}
                                    alt={file.name}
                                    className={classes.thumbImg}
                                />
                            </div>
                        ))}
                    </aside>
                </>
            )}

            {isActive && showProgress && (
                <>
                    <Progress max={PROGRESS_MAX} value={valueImageUpload} />
                    {status === "uploading" && (
                        <p className={classes.progressLabel}>
                            {statusMessage}
                            {" "}
                            (
                            {Math.round(valueImageUpload)}
                            %)
                        </p>
                    )}
                    {status === "success" && (
                        <p className={classes.success}>{statusMessage}</p>
                    )}
                    {status === "error" && (
                        <p className={classes.error}>{statusMessage}</p>
                    )}
                </>
            )}
        </section>
    );
}
