import classes from "./Dropzone.module.css";
import { useDropzone } from 'react-dropzone';
import { useState, useEffect, useCallback } from "react";

import Progress from "../../common/Progress/Progress";

import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";

const thumb = {
    display: 'inline-flex',
    borderRadius: 2,
    marginBottom: 4,
    marginRight: "auto",
    marginLeft: "auto",
    width: "100%",
    height: 80,
    padding: 2,
    justifyContent: "center"
};

const thumbInner = {
    display: 'flex',
    minWidth: 0,
    overflow: 'hidden',
    position: "relative",

};

const img = {
    display: 'block',
    width: 'auto',
    height: '100%',
    borderRadius: "4px"
};

const PROGRESS_MAX = 2000;

export default function Dropzone() {

    const { valueImageUpload, setValueImageUpload, isDropzone } = use(PdfContext)
    const [files, setFiles] = useState([]);
    const [error, setError] = useState();
    const [success, setSuccess] = useState();
    const [duration, setDuration] = useState();

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    const onDrop = useCallback((acceptedFiles => {
        setFiles(acceptedFiles.map(file => Object.assign(file, {
            preview: URL.createObjectURL(file)
        })));

        acceptedFiles.forEach((file) => {

            const formData = new FormData();
            formData.append("file", file);

            const start = performance.now();
            let interval;
            let duration = 0;

            api.httpRequest(ENDPOINTS.IMG.UPLOAD, "POST", formData, "Przesyłanie obrazu nie powiodło się!").
            then((data) => {
                duration = performance.now() - start;
 
                setDuration(duration);
                setTimeout(() => {setSuccess(data.message)}, duration + 100)

                const stepMs = 100;
                const stepValue = (PROGRESS_MAX / duration) * stepMs;
                let elapsed = 0;

                interval = setInterval(() => {
                    elapsed += stepMs;
                    setValueImageUpload((prev) => Math.min(prev + stepValue, PROGRESS_MAX));
                    if(elapsed >= duration){
                        clearInterval(interval);
                    }
                }, stepMs);

            }).
            catch((error) => {setError(error)}).
            finally(() => {;
                setTimeout(() => {
                    if(interval) {clearInterval(interval); setSuccess(undefined)};
                }, duration + 50)
            })
        })
    }), [])


    const { getRootProps, getInputProps } = useDropzone({
        accept: {
            'image/*': []
        },
        maxFiles: 12,
        onDrop
    });

    const thumbs = files.map(file => (
        <div style={thumb} key={file.name}>
            <div style={thumbInner}>
                {isDropzone ? <img
                    src={file.preview}
                    style={img}
                    // Revoke data uri after image is loaded
                    onLoad={() => { URL.revokeObjectURL(file.preview) }}
                /> : ""}
            </div>
        </div>
    ));

    useEffect(() => {
        setValueImageUpload(0);
        return () => files.forEach(file => URL.revokeObjectURL(file.preview));
    }, [files]);

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
            {isDropzone &&
                <><aside className={classes.thumbsWrap}>
                    {thumbs}
                </aside>
                    <Progress max={PROGRESS_MAX} value={valueImageUpload} />
                    {success && <p className={classes.success}>{success}</p>}
                    {error && <p className={classes.error}>{error.detail}</p>}

                    </>
            }
        </section>
    );
}