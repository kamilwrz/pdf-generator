import { useRef, useState, useCallback, use } from "react";
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
            const res = await api.httpRequest(ENDPOINTS.AI.GENERATE_ARTICLE, "POST", form, "Generowanie artykułu nie powiodło się");
            loadAiElements(res.elements, res.title || "Artykuł", "a4-portrait");
            onClose();
        } catch (err) {
            setError(err.message || "Nie udało się wygenerować artykułu.");
        } finally {
            setIsGenerating(false);
        }
    }, [fileData, loadAiElements, onClose]);

    return (
        <div className={classes.panel}>
            <div className={classes.header}>
                <div>
                    <div className={classes.title}>Artykuł AI</div>
                    <div className={classes.subtitle}>Zamień dokument w artykuł w stylu gazetowym</div>
                </div>
                <CloseButton clickHandler={onClose} right={0} top={0} />
            </div>

            <div className={classes.section}>
                <div className={classes.sectionLabel}>1. Prześlij źródłowy PDF</div>
                <div
                    className={`${classes.dropzone} ${fileName ? classes.dropzoneDone : ""}`}
                    onClick={() => fileRef.current?.click()}
                >
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFilePick} />
                    {fileName ? (
                        <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                            <span className={classes.dropFileName}>{fileName}</span>
                            <span className={classes.dropChange}>Zmień</span>
                        </>
                    ) : (
                        <>
                            <UploadIcon />
                            <span className={classes.dropText}>Upuść PDF tutaj lub kliknij, aby wybrać plik</span>
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
                    {isGenerating ? "Pisanie artykułu…" : "Generuj artykuł"}
                </button>
                {isGenerating && <div className={classes.hint}>Przekształcanie dokumentu w tekst redakcyjny i układ kolumn…</div>}
                {error && <div className={classes.error}>{error}</div>}
            </div>
        </div>
    );
}
