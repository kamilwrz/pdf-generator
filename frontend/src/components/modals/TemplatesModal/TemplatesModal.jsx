import { use } from "react";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";

// Lightweight CSS mini-mock of each template, keyed by id. Not a render — just
// enough to convey the layout character (column vs sidebar vs framed).
function Preview({ id, accent }) {
    if (id === "sterling") {
        // engraved certificate: double outline frame, centered name, KPI boxes
        return (
            <div className={classes.paper} style={{ flexDirection: "column", border: "1.5px solid #7C8CA0", boxShadow: "inset 0 0 0 3px #fff, inset 0 0 0 4px #D9E0E9" }}>
                <div className={classes.centerCol} style={{ paddingTop: 10 }}>
                    <span className={classes.bar} style={{ background: "#1B2A41", width: "52%" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "34%" }} />
                    <div style={{ display: "flex", gap: "5px", margin: "7px 0 6px", width: "82%" }}>
                        {[0, 1, 2].map((i) => (
                            <span key={i} style={{ flex: 1, height: "16px", border: "1.2px solid #7C8CA0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ width: "55%", height: "4px", background: "#1B2A41" }} />
                            </span>
                        ))}
                    </div>
                    <span className={classes.line} /><span className={classes.line} />
                    <span className={classes.barThin} style={{ background: accent, width: "24%", marginTop: "5px" }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "solstice") {
        // art deco sidecar: midnight panel, gold inset emblem, serif masthead
        return (
            <div className={classes.paper}>
                <div className={classes.sidebar} style={{ width: "31%", background: "#17283C", alignItems: "center", paddingTop: "10px" }}>
                    <span style={{ width: "31px", height: "31px", border: "1px solid #D99A32", boxShadow: "inset 0 0 0 4px #F8F1E4", background: "#D99A32" }} />
                    <span className={classes.barThin} style={{ background: "#D99A32", width: "57%", marginTop: "12px" }} />
                    <span className={classes.lineLight} /><span className={classes.lineLight} />
                </div>
                <div className={classes.main} style={{ borderLeft: "4px solid #D99A32" }}>
                    <span className={classes.bar} style={{ background: "#17283C", width: "72%" }} />
                    <span className={classes.barThin} style={{ background: "#D99A32", width: "52%" }} />
                    <span className={classes.rule} style={{ background: "#17283C" }} />
                    <span className={classes.barThin} style={{ background: "#17283C", width: "42%", marginTop: "7px" }} />
                    <span className={classes.line} /><span className={classes.line} />
                </div>
            </div>
        );
    }
    if (id === "axiom") {
        // architectural one-column CV: nested blueprint frames and square markers
        return (
            <div className={classes.paper} style={{ flexDirection: "column", position: "relative", padding: "10px 11px", gap: "4px", boxShadow: "inset 0 0 0 1.5px #8EA3A2, inset 0 0 0 4px #fff, inset 0 0 0 5px #C8D7D6" }}>
                <div style={{ height: "27%", border: "1px solid #182A33", padding: "7px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ width: "16px", height: "16px", border: "1.4px solid #0D6E72" }} />
                        <span className={classes.bar} style={{ background: "#182A33", width: "62%" }} />
                    </div>
                    <span className={classes.barThin} style={{ background: accent, width: "48%", marginLeft: "22px" }} />
                    <span className={classes.line} style={{ marginLeft: "22px", width: "72%" }} />
                </div>
                {[0, 1, 2].map((i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: i ? "5px" : "2px" }}>
                        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                            <span style={{ width: "8px", height: "8px", border: `1px solid ${accent}` }} />
                            <span className={classes.barThin} style={{ background: "#182A33", width: i === 1 ? "46%" : "35%" }} />
                        </div>
                        <span className={classes.line} /><span className={classes.line} />
                    </div>
                ))}
            </div>
        );
    }
    if (id === "vellum") {
        // warm editorial one-column CV: calm outline panels and centered masthead
        return (
            <div className={classes.paper} style={{ flexDirection: "column", padding: "9px 11px", gap: "4px", boxShadow: "inset 0 0 0 1.3px #7C3B42, inset 0 0 0 4px #fff, inset 0 0 0 5px #DCCFC0" }}>
                <div style={{ height: "25%", border: "1px solid #B8765A", padding: "7px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "4px" }}>
                    <span className={classes.bar} style={{ background: "#312724", width: "64%" }} />
                    <span className={classes.barThin} style={{ background: accent, width: "48%" }} />
                    <span className={classes.line} style={{ width: "72%" }} />
                </div>
                {[0, 1, 2].map((i) => (
                    <div key={i} style={{ border: "1px solid #B8765A", padding: "4px 5px", display: "flex", flexDirection: "column", gap: "3px", marginTop: i ? "4px" : 0 }}>
                        <span className={classes.barThin} style={{ background: accent, width: i === 0 ? "37%" : "29%" }} />
                        <span className={classes.line} /><span className={classes.line} />
                    </div>
                ))}
            </div>
        );
    }
    if (id === "mistral") {
        // coastal editorial: deep sea masthead, sea-glass strip, narrow notes column
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FBFAF5" }}>
                <div style={{ height: "30%", background: "#173F4C", borderBottom: "4px solid #4D9AA6", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 12px" }}>
                    <span className={classes.bar} style={{ background: "#fff", width: "64%" }} />
                    <span className={classes.barThin} style={{ background: "#B4D5D0", width: "42%" }} />
                </div>
                <div style={{ display: "flex", flex: 1, padding: "9px 11px", gap: "9px" }}>
                    <div style={{ width: "30%", borderRight: "1px solid #C7D7D4", display: "flex", flexDirection: "column", gap: "4px", paddingRight: "7px" }}>
                        <span className={classes.barThin} style={{ background: accent, width: "68%" }} />
                        <span className={classes.line} /><span className={classes.line} />
                        <span className={classes.barThin} style={{ background: accent, width: "52%", marginTop: "6px" }} />
                        <span className={classes.line} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.barThin} style={{ background: "#173F4C", width: "45%" }} />
                        <span className={classes.line} /><span className={classes.line} />
                        <span className={classes.barThin} style={{ background: "#173F4C", width: "52%", marginTop: "6px" }} />
                        <span className={classes.line} /><span className={classes.line} />
                    </div>
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
    if (id === "obsidian") {
        // sidebar dark theme: near-black sidecar, charcoal main field, gold accent
        return (
            <div className={classes.paper} style={{ background: "#15181C" }}>
                <div className={classes.sidebar} style={{ background: "#0B0D10", borderRight: "2px solid #C9A24B" }}>
                    <span className={classes.lineLight} style={{ background: "rgba(201,162,75,.55)" }} />
                    <span className={classes.lineLight} /><span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#F4F1EA", width: "62%" }} />
                    <span className={classes.barThin} style={{ background: "#C9A24B", width: "40%" }} />
                    <span className={classes.rule} style={{ background: "#33383F" }} />
                    <span className={classes.barThin} style={{ background: "#C9A24B", width: "34%", marginTop: "7px" }} />
                    <span className={classes.line} style={{ background: "#33383F" }} /><span className={classes.line} style={{ background: "#33383F" }} />
                </div>
            </div>
        );
    }
    if (id === "raven") {
        // topbar dark theme: raised masthead band over a fully dark page
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#12161C" }}>
                <div style={{ height: "30%", background: "#181D25", borderBottom: "3px solid #3FBFA6", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 12px" }}>
                    <span className={classes.bar} style={{ background: "#F2F5F4", width: "62%" }} />
                    <span className={classes.barThin} style={{ background: "#3FBFA6", width: "40%" }} />
                </div>
                <div className={classes.col}>
                    <span className={classes.barAccent} style={{ background: "#3FBFA6", width: "30%" }} />
                    <span className={classes.line} style={{ background: "#2A3038" }} /><span className={classes.line} style={{ background: "#2A3038" }} />
                    <span className={classes.barAccent} style={{ background: "#3FBFA6", width: "30%", marginTop: "6px" }} />
                    <span className={classes.line} style={{ background: "#2A3038" }} /><span className={classes.line} style={{ background: "#2A3038" }} />
                </div>
            </div>
        );
    }
    if (id === "graphite") {
        // minimalist dark theme: no band, no sidebar — hairlines only
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#101113", padding: "14px 13px", gap: "5px" }}>
                <span className={classes.bar} style={{ background: "#F5F6F7", width: "58%" }} />
                <span className={classes.barThin} style={{ background: "#B7C3CC", width: "36%" }} />
                <span className={classes.rule} style={{ background: "#2B2E32", marginTop: "6px" }} />
                <span className={classes.barThin} style={{ background: "#B7C3CC", width: "26%", marginTop: "10px" }} />
                <span className={classes.rule} style={{ background: "#2B2E32" }} />
                <span className={classes.line} style={{ background: "#2B2E32" }} /><span className={classes.line} style={{ background: "#2B2E32" }} />
                <span className={classes.barThin} style={{ background: "#B7C3CC", width: "22%", marginTop: "8px" }} />
                <span className={classes.rule} style={{ background: "#2B2E32" }} />
                <span className={classes.line} style={{ background: "#2B2E32" }} />
            </div>
        );
    }
    if (id === "onyx") {
        // framed diplomatic dark theme: bronze double frame, centered masthead, KPI row
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#0E0E10", border: "1.5px solid #B08D57", boxShadow: "inset 0 0 0 4px #0E0E10, inset 0 0 0 5px #3A3227" }}>
                <div className={classes.centerCol} style={{ paddingTop: 10 }}>
                    <span className={classes.bar} style={{ background: "#EDE6D8", width: "50%" }} />
                    <span className={classes.barThin} style={{ background: "#B08D57", width: "34%" }} />
                    <div style={{ display: "flex", gap: "5px", margin: "7px 0 6px", width: "82%" }}>
                        {[0, 1, 2].map((i) => (
                            <span key={i} style={{ flex: 1, height: "16px", border: "1.2px solid #B08D57", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ width: "55%", height: "4px", background: "#EDE6D8" }} />
                            </span>
                        ))}
                    </div>
                    <span className={classes.line} style={{ background: "#332C22" }} /><span className={classes.line} style={{ background: "#332C22" }} />
                    <span className={classes.barThin} style={{ background: "#B08D57", width: "24%", marginTop: "5px" }} />
                    <span className={classes.line} style={{ background: "#332C22" }} /><span className={classes.line} style={{ background: "#332C22" }} />
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
    const {
        isTemplates, showTemplates, loadTemplate, A4_Elements,
        autoOpenedTemplates, markTemplatesModalSeen,
    } = use(PdfContext);
    function handlePick(t) {
        if (A4_Elements.length > 0 &&
            !window.confirm("Zastąpić bieżące płótno tym szablonem? Niezapisane elementy zostaną usunięte.")) {
            return;
        }
        const title = `CV ${t.name}`;
        loadTemplate(t.elements, title, t.pageSize);
        if (autoOpenedTemplates) {
            logEvent("template_picked", t.id);
            markTemplatesModalSeen();
        }
        showTemplates();
    }

    // Dismissing (backdrop click / close button) without picking a template.
    // Only counts as onboarding "dismissed" when this is the auto-opened
    // first-time instance — a returning user closing the picker after
    // browsing isn't an onboarding drop-off.
    function handleClose() {
        if (autoOpenedTemplates) {
            logEvent("template_dismissed");
            markTemplatesModalSeen();
        }
        showTemplates();
    }

    return (
        <DialogShell
            open={isTemplates}
            onClose={handleClose}
            width={760}
            title="Szablony"
            subtitle="Wybierz układ — treść na płótnie zostanie zastąpiona."
            footer={<span className={classes.countLabel}>{TEMPLATES.length} szablonów CV</span>}
        >
            <div className={classes.grid}>
                {TEMPLATES.map((t) => (
                    <div key={t.id} className={classes.card}>
                        <div className={classes.previewWrap}>
                            <Preview id={t.id} accent={t.accent} />
                        </div>
                        <div className={classes.cardName}>{t.name}</div>
                        <div className={classes.cardIndustry}>{t.industry}</div>
                        <button type="button" className={classes.useBtn} onClick={() => handlePick(t)}>
                            Użyj szablonu
                        </button>
                    </div>
                ))}
            </div>
        </DialogShell>
    );
}
