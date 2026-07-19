import { useRef, useState, useCallback, use } from "react";
// Shares the AI Deck panel's stylesheet — same visual language, no duplication.
import classes from "../AiDeckPanel/AiDeckPanel.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import CloseButton from "../../common/CloseButton/CloseButton";

const UploadIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13v8"/><path d="m8 17 4-4 4 4"/>
        <path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15"/>
    </svg>
);

// Turn an uploaded PDF into a newspaper-style two-column article (Gazette
// layout): the AI rewrites the content into editorial prose with sections,
// a drop cap, a pull-quote and folio page numbers.
export default function AiArticlePanel({ onClose }) {
    const { loadAiElements } = use(PdfContext);

    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    function handleFilePick(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setFileData(f);
        setError(null);
    }

    const handleGenerate = useCallback(async () => {
        if (!fileData) return;
        setIsGenerating(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            const res = await api.httpRequest(ENDPOINTS.AI.GENERATE_ARTICLE, "POST", form, "Article generation failed");
            loadAiElements(res.elements, res.title || "Article", "a4-portrait");
            onClose();
        } catch (err) {
            setError(err.message || "Failed to generate the article.");
        } finally {
            setIsGenerating(false);
        }
    }, [fileData, loadAiElements, onClose]);

    return (
        <div className={classes.panel}>
            <div className={classes.header}>
                <div>
                    <div className={classes.title}>AI Article</div>
                    <div className={classes.subtitle}>Turn a document into a newspaper-style essay</div>
                </div>
                <CloseButton clickHandler={onClose} right={0} top={0} />
            </div>

            <div className={classes.section}>
                <div className={classes.sectionLabel}>1. Upload the source PDF</div>
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
            </div>

            <div className={classes.section}>
                <button
                    type="button"
                    className={classes.generateBtn}
                    onClick={handleGenerate}
                    disabled={!fileData || isGenerating}
                >
                    {isGenerating ? "Writing your article…" : "Generate article"}
                </button>
                {isGenerating && <div className={classes.hint}>Rewriting the document into editorial prose &amp; laying out columns…</div>}
                {error && <div className={classes.error}>{error}</div>}
            </div>
        </div>
    );
}
