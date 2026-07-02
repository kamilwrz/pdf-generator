import { useRef, useState, useCallback, use } from "react";
import classes from "./AiCvPanel.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { TEMPLATES } from "../../../templates";
import CloseButton from "../../common/CloseButton/CloseButton";

const UploadIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13v8"/><path d="m8 17 4-4 4 4"/>
        <path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15"/>
    </svg>
);

const SparkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>
    </svg>
);

export default function AiCvPanel({ onClose }) {
    const { loadTemplateWithFill, showTemplates } = use(PdfContext);

    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);       // the File object
    const [cvData, setCvData] = useState(null);           // extracted JSON (cached)
    const [isExtracting, setIsExtracting] = useState(false);
    const [fillingId, setFillingId] = useState(null);     // template id currently filling
    const [error, setError] = useState(null);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    function handleFilePick(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setFileData(f);
        setCvData(null);
        setError(null);
    }

    const handleExtract = useCallback(async () => {
        if (!fileData) return;
        setIsExtracting(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            const res = await api.httpRequest(ENDPOINTS.AI.EXTRACT_CV, "POST", form, "CV extraction failed");
            setCvData(res.cv_data);
        } catch (err) {
            setError(err.message || "Failed to extract CV data.");
        } finally {
            setIsExtracting(false);
        }
    }, [fileData]);

    const handleFill = useCallback(async (template) => {
        if (!cvData) return;
        setFillingId(template.id);
        setError(null);
        try {
            // Tag each element with its array index so the backend can use it
            // as a stable key (template specs have no element_id yet).
            const indexedElements = template.elements.map((el, i) => ({ ...el, element_id: String(i) }));
            const res = await api.httpRequest(
                ENDPOINTS.AI.FILL_TEMPLATE, "POST",
                JSON.stringify({ cv_data: cvData, elements: indexedElements }),
                "Template fill failed"
            );
            loadTemplateWithFill(template.elements, template.name, res.fills);
            onClose();
        } catch (err) {
            setError(err.message || "Failed to fill template.");
        } finally {
            setFillingId(null);
        }
    }, [cvData, loadTemplateWithFill, onClose]);

    const extracted = cvData && (cvData.name || cvData.email);

    return (
        <div className={classes.panel}>
            <div className={classes.header}>
                <div>
                    <div className={classes.title}>Fill from my CV</div>
                    <div className={classes.subtitle}>Upload your PDF — AI fills any template with your data</div>
                </div>
                <CloseButton clickHandler={onClose} right={0} top={0} />
            </div>

            {/* Step 1 — Upload */}
            <div className={classes.section}>
                <div className={classes.sectionLabel}>1. Upload your CV</div>
                <div
                    className={`${classes.dropzone} ${fileName ? classes.dropzoneDone : ""}`}
                    onClick={() => fileRef.current?.click()}
                >
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFilePick} />
                    {fileName ? (
                        <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                            <span className={classes.dropFileName}>{fileName}</span>
                            <span className={classes.dropChange}>Change</span>
                        </>
                    ) : (
                        <>
                            <UploadIcon />
                            <span className={classes.dropText}>Drop PDF here or click to browse</span>
                        </>
                    )}
                </div>
                {fileName && !cvData && (
                    <button
                        type="button"
                        className={classes.extractBtn}
                        onClick={handleExtract}
                        disabled={isExtracting}
                    >
                        {isExtracting ? (
                            <><span className={classes.spinner} />Extracting your CV…</>
                        ) : (
                            <><SparkIcon />Extract CV data</>
                        )}
                    </button>
                )}
            </div>

            {/* Extraction preview */}
            {extracted && (
                <div className={classes.preview}>
                    <div className={classes.previewName}>{cvData.name}</div>
                    <div className={classes.previewMeta}>{cvData.title}</div>
                    <div className={classes.previewStats}>
                        <span>{cvData.experience?.length ?? 0} jobs</span>
                        <span>·</span>
                        <span>{cvData.education?.length ?? 0} education</span>
                        <span>·</span>
                        <span>{cvData.skills?.length ?? 0} skills</span>
                    </div>
                    <button type="button" className={classes.reExtract} onClick={() => { setCvData(null); }}>
                        Re-extract
                    </button>
                </div>
            )}

            {/* Step 2 — Pick template and fill */}
            {extracted && (
                <div className={classes.section}>
                    <div className={classes.sectionLabel}>2. Choose a template to fill</div>
                    <div className={classes.templateGrid}>
                        {TEMPLATES.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                className={classes.templateCard}
                                onClick={() => handleFill(t)}
                                disabled={fillingId !== null}
                            >
                                <span className={classes.dot} style={{ background: t.accent }} />
                                <span className={classes.tName}>{t.name}</span>
                                {fillingId === t.id && <span className={classes.spinner} />}
                            </button>
                        ))}
                    </div>
                    <p className={classes.hint}>
                        You can fill multiple templates without re-uploading.
                        Each one opens on the canvas for immediate editing.
                    </p>
                </div>
            )}

            {error && <div className={classes.error}>{error}</div>}
        </div>
    );
}
