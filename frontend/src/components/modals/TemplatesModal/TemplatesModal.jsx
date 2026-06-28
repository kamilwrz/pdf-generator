import { createPortal } from "react-dom";
import { use } from "react";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import CloseButton from "../../common/CloseButton/CloseButton";

// Lightweight CSS mini-mock of each template, keyed by id. Not a render — just
// enough to convey the layout character (column vs sidebar vs framed).
function Preview({ id, accent }) {
    if (id === "it") {
        return (
            <div className={classes.paper}>
                <div className={classes.sidebar} style={{ background: "#0F2A33" }}>
                    <span className={classes.photo} />
                    <span className={classes.bar} style={{ background: "#fff", width: "70%" }} />
                    <span className={classes.barAccent} style={{ background: accent, width: "45%" }} />
                    <span className={classes.lineLight} /><span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.barAccent} style={{ background: accent, width: "40%" }} />
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.barAccent} style={{ background: accent, width: "40%", marginTop: "7px" }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "education") {
        return (
            <div className={classes.paper} style={{ border: "1px solid #D8CDBA" }}>
                <div className={classes.centerCol}>
                    <span className={classes.bar} style={{ background: "#2E2A25", width: "55%" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "32%" }} />
                    <span className={classes.flank} style={{ background: accent }} />
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.flank} style={{ background: accent }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    // finance
    return (
        <div className={classes.paper}>
            <div className={classes.col}>
                <span className={classes.bar} style={{ background: "#16243A", width: "62%" }} />
                <span className={classes.rule} style={{ background: "#16243A" }} />
                <span className={classes.barThin} style={{ background: accent, width: "22%" }} />
                <span className={classes.line} /><span className={classes.line} />
                <span className={classes.barThin} style={{ background: accent, width: "22%", marginTop: "6px" }} />
                <span className={classes.line} /><span className={classes.line} />
            </div>
        </div>
    );
}

export default function TemplatesModal() {
    const { isTemplates, showTemplates, loadTemplate, A4_Elements } = use(PdfContext);

    if (!isTemplates) return null;

    function handlePick(t) {
        if (A4_Elements.length > 0 &&
            !window.confirm("Replace the current canvas with this template? Unsaved elements on the canvas will be cleared.")) {
            return;
        }
        loadTemplate(t.elements, t.name);
        showTemplates();
    }

    return createPortal(
        <div className={classes.backdrop} onClick={showTemplates}>
            <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
                <div className={classes.header}>
                    <div>
                        <h2>Start from a template</h2>
                        <p>Pick a CV layout, then personalize every element on the canvas.</p>
                    </div>
                    <CloseButton clickHandler={showTemplates} right={20} top={20} />
                </div>
                <div className={classes.grid}>
                    {TEMPLATES.map((t) => (
                        <div key={t.id} className={classes.card}>
                            <div className={classes.previewWrap}>
                                <Preview id={t.id} accent={t.accent} />
                            </div>
                            <div className={classes.cardName}>{t.name}</div>
                            <div className={classes.cardIndustry}>{t.industry}</div>
                            <button type="button" className={classes.useBtn} onClick={() => handlePick(t)}>
                                Use template
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}
