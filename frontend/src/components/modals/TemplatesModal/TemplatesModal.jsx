import { createPortal } from "react-dom";
import { use, useState } from "react";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "../../../templates";
import CloseButton from "../../common/CloseButton/CloseButton";

// Lightweight CSS mini-mock of each template, keyed by id. Not a render — just
// enough to convey the layout character (column vs sidebar vs framed).
function Preview({ id, accent }) {
    if (id === "meridian") {
        // landscape 16:9 slide mock: left accent bar, serif title, frame motif
        return (
            <div className={classes.paper} style={{ aspectRatio: "16 / 9", height: "auto", alignSelf: "center" }}>
                <div style={{ width: "5px", background: accent }} />
                <div className={classes.col} style={{ justifyContent: "center" }}>
                    <span className={classes.bar} style={{ background: "#1F2A3A", width: "58%", height: "9px" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "20%" }} />
                    <span className={classes.line} style={{ width: "48%" }} />
                </div>
                <div style={{ position: "relative", width: "34%", margin: "10px" }}>
                    <span style={{ position: "absolute", inset: "8% 20% 30% 0", border: `1.5px solid #9DBBE6` }} />
                    <span style={{ position: "absolute", inset: "22% 6% 16% 14%", border: `1.5px solid ${accent}` }} />
                </div>
            </div>
        );
    }
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
    if (id === "nocturne") {
        return (
            <div className={classes.paper} style={{ flexDirection: "column" }}>
                <div style={{ height: "30%", background: "#1F2933", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 12px" }}>
                    <span className={classes.bar} style={{ background: "#fff", width: "62%" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "34%" }} />
                </div>
                <div className={classes.col}>
                    <span className={classes.barAccent} style={{ background: accent, width: "30%" }} />
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.barAccent} style={{ background: accent, width: "30%", marginTop: "6px" }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "ampersand") {
        return (
            <div className={classes.paper}>
                <div style={{ width: "5px", background: accent }} />
                <div className={classes.col}>
                    <span className={classes.bar} style={{ background: "#2A2320", width: "55%" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "30%" }} />
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.bar} style={{ background: "#2A2320", width: "42%", marginTop: "6px" }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "blueprint") {
        return (
            <div className={classes.paper} style={{ flexDirection: "column" }}>
                <div style={{ padding: "12px 12px 6px" }}>
                    <span className={classes.bar} style={{ background: "#1A2530", width: "45%", display: "block" }} />
                    <span className={classes.rule} style={{ background: "#1A2530", marginTop: "6px" }} />
                </div>
                <div style={{ display: "flex", flex: 1, gap: "8px", padding: "0 12px 12px" }}>
                    <div style={{ flex: "0 0 34%", display: "flex", flexDirection: "column", gap: "4px", borderRight: "1px solid #D8DEE4", paddingRight: "6px" }}>
                        <span className={classes.barThin} style={{ background: accent, width: "70%" }} />
                        <span className={classes.line} /><span className={classes.line} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.barThin} style={{ background: accent, width: "55%" }} />
                        <span className={classes.line} /><span className={classes.line} />
                    </div>
                </div>
            </div>
        );
    }
    if (id === "monolith") {
        return (
            <div className={classes.paper} style={{ flexDirection: "column" }}>
                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span className={classes.bar} style={{ background: "#0A0A0A", width: "62%" }} />
                    <span className={classes.barThin} style={{ background: "#777777", width: "40%" }} />
                    <span className={classes.rule} style={{ background: "#444444" }} />
                </div>
                <div className={classes.col} style={{ paddingTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                        <span style={{ width: "4px", height: "12px", background: "#0A0A0A", flexShrink: 0 }} />
                        <span className={classes.barThin} style={{ background: "#0A0A0A", width: "55%" }} />
                    </div>
                    <span className={classes.line} /><span className={classes.line} />
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px", marginBottom: "4px" }}>
                        <span style={{ width: "4px", height: "12px", background: "#0A0A0A", flexShrink: 0 }} />
                        <span className={classes.barThin} style={{ background: "#0A0A0A", width: "35%" }} />
                    </div>
                    <span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "prism") {
        return (
            <div className={classes.paper} style={{ flexDirection: "column" }}>
                <div style={{ height: "32%", background: "#6B21A8", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 12px" }}>
                    <span className={classes.bar} style={{ background: "#fff", width: "62%" }} />
                    <span className={classes.barThin} style={{ background: "#E9D5FF", width: "42%" }} />
                </div>
                <div style={{ height: "3px", background: "#0D9488" }} />
                <div className={classes.col}>
                    {[["#3E6DB5"], ["#0D9488"], ["#D63384"]].map(([c], i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px", marginTop: i > 0 ? "6px" : 0 }}>
                            <span style={{ width: "8px", height: "8px", background: c, flexShrink: 0 }} />
                            <span className={classes.barThin} style={{ background: "#1A1A1A", width: "45%" }} />
                        </div>
                    ))}
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "aria") {
        return (
            <div className={classes.paper} style={{ flexDirection: "column" }}>
                <div className={classes.col}>
                    {/* large regular-weight name stub */}
                    <span className={classes.bar} style={{ background: "#1A1A1A", width: "72%", height: "9px" }} />
                    <span className={classes.barThin} style={{ background: "#888888", width: "38%" }} />
                    <span className={classes.rule} style={{ background: "#BBBBBB", marginTop: "4px" }} />
                    {/* section label (small) + hairline */}
                    <span className={classes.barThin} style={{ background: "#999999", width: "28%", marginTop: "10px" }} />
                    <span className={classes.rule} style={{ background: "#DDDDDD" }} />
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.barThin} style={{ background: "#999999", width: "22%", marginTop: "8px" }} />
                    <span className={classes.rule} style={{ background: "#DDDDDD" }} />
                    <span className={classes.line} />
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
    const [category, setCategory] = useState("cv");

    if (!isTemplates) return null;

    function handlePick(t) {
        if (A4_Elements.length > 0 &&
            !window.confirm("Replace the current canvas with this template? Unsaved elements on the canvas will be cleared.")) {
            return;
        }
        const title = t.category === "deck" ? `${t.name} deck` : `${t.name} CV`;
        loadTemplate(t.elements, title, t.pageSize);
        showTemplates();
    }

    const visible = TEMPLATES.filter((t) => (t.category ?? "cv") === category);

    return createPortal(
        <div className={classes.backdrop} onClick={showTemplates}>
            <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
                <div className={classes.header}>
                    <div>
                        <h2>Start from a template</h2>
                        <p>Pick a layout, then personalize every element on the canvas.</p>
                    </div>
                    <CloseButton clickHandler={showTemplates} right={20} top={20} />
                </div>
                <div className={classes.tabs}>
                    {TEMPLATE_CATEGORIES.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className={`${classes.tab} ${category === c.id ? classes.tabActive : ""}`}
                            onClick={() => setCategory(c.id)}
                        >{c.label}</button>
                    ))}
                </div>
                <div className={classes.grid}>
                    {visible.map((t) => (
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
