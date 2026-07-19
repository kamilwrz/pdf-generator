import { useRef, useState, useEffect, useCallback, use } from "react";
import classes from "./AiDeckPanel.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";
import { TEMPLATES } from "../../../templates";
import { DECK_THEMES } from "../../../templates/meridian";
import CloseButton from "../../common/CloseButton/CloseButton";

const DECKS = TEMPLATES.filter((t) => t.category === "deck");

// tiny 16:9 mock of a deck theme's title slide
function StyleMock({ theme }) {
    return (
        <span style={{
            display: "flex", width: "100%", aspectRatio: "16 / 9", borderRadius: 6,
            overflow: "hidden", background: theme.dark ? theme.bg : "#fff",
            border: "1px solid var(--border)",
        }}>
            <span style={{ width: 4, background: theme.accent, flexShrink: 0 }} />
            <span style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, padding: "0 8px" }}>
                <span style={{ height: 6, width: "70%", borderRadius: 2, background: theme.ink }} />
                <span style={{ height: 3, width: "28%", borderRadius: 2, background: theme.accent }} />
                <span style={{ height: 3, width: "52%", borderRadius: 2, background: theme.mist }} />
            </span>
        </span>
    );
}

const UploadIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13v8"/><path d="m8 17 4-4 4 4"/>
        <path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15"/>
    </svg>
);

// Generate a 16:9 slide deck from an uploaded PDF. Optional: tick gallery
// images — the backend vision-captions them and places each on the slide whose
// content it matches.
export default function AiDeckPanel({ onClose }) {
    const { loadAiElements } = use(PdfContext);

    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);
    const [images, setImages] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [templateId, setTemplateId] = useState(DECKS[0]?.id ?? "meridian");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    useEffect(() => {
        api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Fetching images failed!")
            .then(setImages)
            .catch(() => setImages([]));   // empty gallery is fine — images are optional
    }, []);

    function handleFilePick(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setFileData(f);
        setError(null);
    }

    function toggleImage(id) {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }

    const handleGenerate = useCallback(async () => {
        if (!fileData) return;
        setIsGenerating(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            form.append("image_ids", JSON.stringify(selectedIds));
            form.append("template_id", templateId);
            const res = await api.httpRequest(ENDPOINTS.AI.GENERATE_DECK, "POST", form, "Deck generation failed");
            loadAiElements(res.elements, res.title || "Deck", "deck-16-9");
            onClose();
        } catch (err) {
            setError(err.message || "Failed to generate the deck.");
        } finally {
            setIsGenerating(false);
        }
    }, [fileData, selectedIds, templateId, loadAiElements, onClose]);

    return (
        <div className={classes.panel}>
            <div className={classes.header}>
                <div>
                    <div className={classes.title}>AI Deck</div>
                    <div className={classes.subtitle}>Turn a document into a 16:9 slide deck</div>
                </div>
                <CloseButton clickHandler={onClose} right={0} top={0} />
            </div>

            {/* Step 1 — source document */}
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

            {/* Step 2 — optional gallery images */}
            <div className={classes.section}>
                <div className={classes.sectionLabel}>
                    2. Pick images <span className={classes.optional}>(optional — AI places them by meaning)</span>
                </div>
                {images.length === 0 ? (
                    <div className={classes.emptyGallery}>No gallery images yet — upload some via the sidebar first.</div>
                ) : (
                    <div className={classes.imageGrid}>
                        {images.map((img) => {
                            const url = img.file_path.startsWith("http")
                                ? img.file_path
                                : `${API_BASE_URL}/${img.file_path}`;
                            const on = selectedIds.includes(img.id);
                            return (
                                <button
                                    key={img.id}
                                    type="button"
                                    className={`${classes.thumb} ${on ? classes.thumbOn : ""}`}
                                    onClick={() => toggleImage(img.id)}
                                    title={img.filename}
                                >
                                    <img src={url} alt={img.filename} />
                                    {on && <span className={classes.tick}>✓</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Step 3 — deck style */}
            <div className={classes.section}>
                <div className={classes.sectionLabel}>3. Choose a style</div>
                <div className={classes.styleGrid}>
                    {DECKS.map((t) => {
                        const theme = DECK_THEMES[t.id];
                        const on = templateId === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={`${classes.styleCard} ${on ? classes.styleCardOn : ""}`}
                                onClick={() => setTemplateId(t.id)}
                            >
                                {theme && <StyleMock theme={theme} />}
                                <span className={classes.styleName}>{t.name}</span>
                                <span className={classes.styleTag}>{t.industry.replace("Deck · ", "")}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Step 4 — generate */}
            <div className={classes.section}>
                <button
                    type="button"
                    className={classes.generateBtn}
                    onClick={handleGenerate}
                    disabled={!fileData || isGenerating}
                >
                    {isGenerating ? "Designing your deck…" : "Generate deck"}
                </button>
                {isGenerating && <div className={classes.hint}>Reading the document, captioning images, laying out slides…</div>}
                {error && <div className={classes.error}>{error}</div>}
            </div>
        </div>
    );
}
