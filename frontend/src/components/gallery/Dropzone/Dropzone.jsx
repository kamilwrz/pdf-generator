/**
 * Image upload dropzone with shared Polish batch progress messaging.
 * Uploads run sequentially so the progress bar reflects total files, not one.
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

const PROGRESS_MAX = 100;

export default function Dropzone() {
    const { valueImageUpload, setValueImageUpload, isDropzone } = use(PdfContext);
    const [files, setFiles] = useState([]);
    const [status, setStatus] = useState("idle"); // idle | uploading | success | error
    const [statusMessage, setStatusMessage] = useState("");
    const uploadTokenRef = useRef(0);

    const onDrop = useCallback((acceptedFiles) => {
        if (!acceptedFiles?.length) return;

        const token = ++uploadTokenRef.current;
        const batch = acceptedFiles.map((file) => Object.assign(file, {
            preview: URL.createObjectURL(file),
        }));

        setFiles((prev) => {
            prev.forEach((file) => URL.revokeObjectURL(file.preview));
            return batch;
        });
        setStatus("uploading");
        setStatusMessage(polishUploadingMessage(batch.length));
        setValueImageUpload(0);

        const api = new ApiClient({
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        });

        let completed = 0;
        let succeeded = 0;
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
                    "Przesyłanie obrazu nie powiodło się!",
                );
                succeeded += 1;
            } catch {
                // Counted in completed; final message covers failures.
            } finally {
                bumpProgress();
            }
        })).then(() => {
            if (token !== uploadTokenRef.current) return;
            const message = polishUploadResultMessage(succeeded, total);
            setStatusMessage(message);
            setStatus(succeeded === 0 ? "error" : "success");
            setValueImageUpload(PROGRESS_MAX);
        });
    }, [setValueImageUpload]);

    const { getRootProps, getInputProps } = useDropzone({
        accept: { "image/*": [] },
        maxFiles: 12,
        disabled: status === "uploading",
        onDrop,
    });

    useEffect(() => () => {
        files.forEach((file) => URL.revokeObjectURL(file.preview));
    }, [files]);

    const showProgress = status === "uploading" || status === "success" || status === "error";

    return (
        <section className={classes.dropzoneContainer}>
            <div {...getRootProps({ className: classes.dropzone })}>
                <input {...getInputProps()} />
                <div className={classes.dropIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--chrome-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8" /><path d="m8 17 4-4 4 4" /><path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15" /></svg>
                </div>
                <div className={classes.dropTitle}>
                    {status === "uploading" ? "Przesyłanie…" : "Upuść obrazy tutaj"}
                </div>
                <div className={classes.dropHint}>
                    {status === "uploading"
                        ? statusMessage
                        : <>lub <span>przeglądaj pliki</span></>}
                </div>
            </div>

            {isDropzone && files.length > 0 && (
                <aside className={classes.thumbsWrap} aria-label="Podgląd przesłanych obrazów">
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
            )}

            {isDropzone && showProgress && (
                <>
                    <Progress max={PROGRESS_MAX} value={valueImageUpload} />
                    {status === "uploading" && (
                        <p className={classes.progressLabel}>
                            {statusMessage}
                            {" "}
                            ({Math.round(valueImageUpload)}%)
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
