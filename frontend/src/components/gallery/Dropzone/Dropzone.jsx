/**
 * Profile-photo upload dropzone with shared Polish batch progress messaging.
 *
 * Uploads run sequentially so the progress bar reflects total files, not one.
 * The library is capped at {@link MAX_PROFILE_PHOTOS}; when full, the surface
 * is disabled and explains that photos must be deleted first.
 */
import classes from "./Dropzone.module.css";
import { useDropzone } from "react-dropzone";
import { useState, useEffect, useCallback, useRef } from "react";

import Progress from "../../common/Progress/Progress";

import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";

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
 * @param {{ onLibraryChange?: (info: { libraryCount: number; batchCount: number; remainingSlots: number }) => void }} props
 */
export default function Dropzone({ onLibraryChange }) {
    const { valueImageUpload, setValueImageUpload, isDropzone } = use(PdfContext);
    const [files, setFiles] = useState([]);
    const [libraryCount, setLibraryCount] = useState(0);
    const [libraryLoaded, setLibraryLoaded] = useState(false);
    const [status, setStatus] = useState("idle"); // idle | uploading | success | error
    const [statusMessage, setStatusMessage] = useState("");
    const uploadTokenRef = useRef(0);

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
            // Keep the previous count on transient failures so a network blip
            // does not unlock uploads past the known library size.
        } finally {
            setLibraryLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (!isDropzone) return undefined;
        setLibraryLoaded(false);
        setStatus("idle");
        setStatusMessage("");
        setFiles((prev) => {
            prev.forEach((file) => URL.revokeObjectURL(file.preview));
            return [];
        });
        setValueImageUpload(0);
        refreshLibraryCount();
        return undefined;
    }, [isDropzone, refreshLibraryCount, setValueImageUpload]);

    const onDrop = useCallback((acceptedFiles) => {
        if (!acceptedFiles?.length) return;

        // Image upload has nowhere to persist for a guest — there is no
        // account yet to own the uploaded file.
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

        // Cap the batch to free slots so a multi-select cannot exceed the library.
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

        let completed = 0;
        let succeeded = 0;
        let lastErrorMessage = "";
        const total = batch.length;

        const bumpProgress = () => {
            if (token !== uploadTokenRef.current) return;
            completed += 1;
            setValueImageUpload(Math.round((completed / total) * PROGRESS_MAX));
        };

        Promise.all(batch.map(async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            try {
                await api.httpRequest(
                    ENDPOINTS.IMG.UPLOAD,
                    "POST",
                    formData,
                    "Przesyłanie zdjęcia profilowego nie powiodło się!",
                );
                succeeded += 1;
            } catch (err) {
                // Keep the server detail (e.g. library-full 403) for the final status.
                if (err?.message) lastErrorMessage = err.message;
            } finally {
                bumpProgress();
            }
        })).then(async () => {
            if (token !== uploadTokenRef.current) return;
            const summary = polishUploadResultMessage(succeeded, total);
            const message = succeeded === 0 && lastErrorMessage
                ? lastErrorMessage
                : summary;
            if (message) setStatusMessage(message);
            setStatus(succeeded === 0 ? "error" : "success");
            setValueImageUpload(PROGRESS_MAX);
            if (succeeded > 0) {
                await refreshLibraryCount();
            }
        });
    }, [remainingSlots, refreshLibraryCount, setValueImageUpload]);

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

    let title = "Upuść zdjęcia profilowe tutaj";
    let hint = <>lub <span>przeglądaj pliki</span></>;
    if (!libraryLoaded) {
        title = "Sprawdzanie limitu…";
        hint = `Maksymalnie ${MAX_PROFILE_PHOTOS} zdjęć profilowych w CV`;
    } else if (atLimit) {
        title = "Limit zdjęć profilowych jest pełny";
        hint = LIMIT_FULL_MESSAGE;
    } else if (status === "uploading") {
        title = "Przesyłanie…";
        hint = statusMessage;
    } else if (isDragActive) {
        title = "Upuść, aby przesłać";
        hint = `Pozostało ${remainingSlots} z ${MAX_PROFILE_PHOTOS} miejsc`;
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
        <section className={classes.dropzoneContainer}>
            <p className={classes.intro}>
                Prześlij zdjęcia profilowe, które chcesz używać w CV.
                Biblioteka mieści maksymalnie
                {" "}
                {MAX_PROFILE_PHOTOS}
                {" "}
                zdjęcia.
            </p>

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

            {atLimit ? (
                <p className={classes.limitBanner} role="status">
                    {LIMIT_FULL_MESSAGE}
                </p>
            ) : null}

            {isDropzone && files.length > 0 && (
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

            {isDropzone && showProgress && (
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
