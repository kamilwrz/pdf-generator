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
    marginBottom: 8,
    marginRight: "auto",
    marginLeft: "auto",
    width: "100%",
    height: 200,
    padding: 4,
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

    const { progressValue, setValue, isDropzone } = use(PdfContext)
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

            api.httpRequest(ENDPOINTS.IMG.UPLOAD, "POST", formData, "Image upload failed!").
            then((data) => {
                duration = performance.now() - start;
 
                setDuration(duration);
                setTimeout(() => {setSuccess(data.message)}, duration + 100)

                const stepMs = 100;
                const stepValue = (PROGRESS_MAX / duration) * stepMs;
                let elapsed = 0;

                interval = setInterval(() => {
                    elapsed += stepMs;
                    setValue((prev) => Math.min(prev + stepValue, PROGRESS_MAX));
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
        maxFiles: 1,
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
        setValue(0);
        return () => files.forEach(file => URL.revokeObjectURL(file.preview));
    }, [files]);

    return (
        <section className={classes.DZcontainer}>
            <div {...getRootProps({ className: 'dropzone' })}>
                <input {...getInputProps()} />
                <p className={classes.fileInput}>Drop the image here</p>
            </div>
            {isDropzone &&
                <><aside>
                    {thumbs}
                </aside>
                    <Progress max={PROGRESS_MAX} value={progressValue} />
                    {success && <p className={classes.success}>{success}</p>}
                    {error && <p className={classes.error}>{error.detail}</p>}
                    
                    </>
            }
        </section>
    );
}