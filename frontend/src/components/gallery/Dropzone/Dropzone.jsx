import classes from "./Dropzone.module.css";
import { useDropzone } from "react-dropzone";
import { useState, useEffect, useCallback } from "react";

import Progress from "../../common/Progress/Progress";

import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";

const PROGRESS_MAX = 2000;

export default function Dropzone() {
    const { valueImageUpload, setValueImageUpload, isDropzone } = use(PdfContext);
    const [files, setFiles] = useState([]);
    const [error, setError] = useState();
    const [success, setSuccess] = useState();
    const [duration, setDuration] = useState();

    const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });

    const onDrop = useCallback((acceptedFiles) => {
        setFiles(acceptedFiles.map((file) => Object.assign(file, {
            preview: URL.createObjectURL(file),
        })));

        acceptedFiles.forEach((file) => {
            const formData = new FormData();
            formData.append("file", file);

            const start = performance.now();
            let interval;
            let uploadDuration = 0;

            api.httpRequest(ENDPOINTS.IMG.UPLOAD, "POST", formData, "Przesyłanie obrazu nie powiodło się!")
                .then((data) => {
                    uploadDuration = performance.now() - start;

                    setDuration(uploadDuration);
                    setTimeout(() => { setSuccess(data.message); }, uploadDuration + 100);

                    const stepMs = 100;
                    const stepValue = (PROGRESS_MAX / uploadDuration) * stepMs;
                    let elapsed = 0;

                    interval = setInterval(() => {
                        elapsed += stepMs;
                        setValueImageUpload((prev) => Math.min(prev + stepValue, PROGRESS_MAX));
                        if (elapsed >= uploadDuration) {
                            clearInterval(interval);
                        }
                    }, stepMs);
                })
                .catch((err) => { setError(err); })
                .finally(() => {
                    setTimeout(() => {
                        if (interval) { clearInterval(interval); setSuccess(undefined); }
                    }, uploadDuration + 50);
                });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- match prior upload behavior; token is read at call time
    }, []);

    const { getRootProps, getInputProps } = useDropzone({
        accept: { "image/*": [] },
        maxFiles: 12,
        onDrop,
    });

    useEffect(() => {
        setValueImageUpload(0);
        return () => files.forEach((file) => URL.revokeObjectURL(file.preview));
    }, [files, setValueImageUpload]);

    return (
        <section className={classes.dropzoneContainer}>
            <div {...getRootProps({ className: classes.dropzone })}>
                <input {...getInputProps()} />
                <div className={classes.dropIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--chrome-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8" /><path d="m8 17 4-4 4 4" /><path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15" /></svg>
                </div>
                <div className={classes.dropTitle}>Upuść obrazy tutaj</div>
                <div className={classes.dropHint}>lub <span>przeglądaj pliki</span></div>
            </div>

            {isDropzone && files.length > 0 && (
                <aside className={classes.thumbsWrap} aria-label="Podgląd przesłanych obrazów">
                    {files.map((file) => (
                        <div className={classes.thumb} key={file.name}>
                            <img
                                src={file.preview}
                                alt={file.name}
                                className={classes.thumbImg}
                            />
                        </div>
                    ))}
                </aside>
            )}

            {isDropzone && (
                <>
                    <Progress max={PROGRESS_MAX} value={valueImageUpload} />
                    {success && <p className={classes.success}>{success}</p>}
                    {error && <p className={classes.error}>{error.detail}</p>}
                </>
            )}
        </section>
    );
}
