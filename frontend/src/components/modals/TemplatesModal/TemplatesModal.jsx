import { use } from "react";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";

// Lightweight CSS mini-mock of each template, keyed by id. Not a render — just
// enough to convey the layout character (column vs sidebar vs framed).
function Preview({ id }) {
    /* ---- Finanse ---- */
    if (id === "ledger") {
        // institutional navy masthead + content column
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#F7F9FA" }}>
                <div style={{ height: "28%", background: "#102A43", borderBottom: "3px solid #2E5E86", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 10px" }}>
                    <span className={classes.bar} style={{ background: "#FFFFFF", width: "58%" }} />
                    <span className={classes.barThin} style={{ background: "#C7D7E2", width: "42%" }} />
                </div>
                <div className={classes.col} style={{ paddingTop: 8 }}>
                    <span className={classes.barThin} style={{ background: "#2E5E86", width: "28%" }} />
                    <span className={classes.rule} style={{ background: "#AEBECC" }} />
                    <span className={classes.line} style={{ background: "#D5DEE6" }} /><span className={classes.line} style={{ background: "#D5DEE6" }} />
                    <span className={classes.barThin} style={{ background: "#2E5E86", width: "36%", marginTop: "6px" }} />
                    <span className={classes.line} style={{ background: "#D5DEE6" }} /><span className={classes.line} style={{ background: "#D5DEE6" }} />
                </div>
            </div>
        );
    }
    if (id === "nimbus") {
        // airy blue-grey editorial, left accent rail + soft markers
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#F5F8FA", padding: "10px 11px", gap: "4px" }}>
                <div style={{ height: "3px", background: "#B9D2E5", margin: "-10px -11px 8px" }} />
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "3px", height: "28px", background: "#5F8EAD", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#2B3D4C", width: "68%" }} />
                        <span className={classes.barThin} style={{ background: "#5F8EAD", width: "48%" }} />
                    </div>
                    <span style={{ width: "22px", height: "26px", border: "1.2px solid #B9D2E5", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", gap: "4px", margin: "6px 0 4px 9px" }}>
                    <span style={{ width: "8px", height: "8px", background: "#5F8EAD" }} />
                    <span style={{ width: "8px", height: "8px", border: "1.2px solid #B9D2E5" }} />
                    <span style={{ width: "8px", height: "8px", border: "1.2px solid #B9D2E5" }} />
                </div>
                <span className={classes.barThin} style={{ background: "#5F8EAD", width: "26%", marginLeft: "9px" }} />
                <span className={classes.rule} style={{ background: "#E9EEF1", marginLeft: "9px" }} />
                <span className={classes.line} style={{ background: "#E9EEF1", marginLeft: "9px" }} /><span className={classes.line} style={{ background: "#E9EEF1", marginLeft: "9px" }} />
                <span className={classes.barThin} style={{ background: "#5F8EAD", width: "34%", marginTop: "6px", marginLeft: "9px" }} />
                <span className={classes.line} style={{ background: "#E9EEF1", marginLeft: "9px" }} />
            </div>
        );
    }
    if (id === "cinder") {
        // black masthead, signal red, ash body
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#F4F3F1" }}>
                <div style={{ height: "3px", background: "#C93F3F" }} />
                <div style={{ height: "28%", background: "#111315", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 12px", borderLeft: "4px solid #C93F3F" }}>
                    <span className={classes.bar} style={{ background: "#FFFFFF", width: "60%" }} />
                    <span className={classes.barThin} style={{ background: "#E06B67", width: "44%" }} />
                </div>
                <div className={classes.col}>
                    <div style={{ display: "flex", gap: "5px", marginBottom: "6px", justifyContent: "flex-end" }}>
                        <span style={{ width: "14px", height: "14px", border: "1.3px solid #C93F3F" }} />
                        <span style={{ width: "16px", height: "16px", border: "1px solid #767B80" }} />
                    </div>
                    <span className={classes.barThin} style={{ background: "#C93F3F", width: "30%" }} />
                    <span className={classes.rule} style={{ background: "#D5D6D6" }} />
                    <span className={classes.line} style={{ background: "#D5D6D6" }} /><span className={classes.line} style={{ background: "#D5D6D6" }} />
                    <span className={classes.barThin} style={{ background: "#292D31", width: "38%", marginTop: "6px" }} />
                    <span className={classes.line} style={{ background: "#D5D6D6" }} />
                </div>
            </div>
        );
    }
    if (id === "rift") {
        // Swiss-modernist field: ash/black abstract + red nodes, offset column
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "linear-gradient(135deg, #E8E9EA 0%, #C9CBCC 42%, #565B60 42%, #181A1C 100%)", padding: "12px 10px 12px 28px", gap: "4px" }}>
                <span className={classes.bar} style={{ background: "#181A1C", width: "72%" }} />
                <span className={classes.barThin} style={{ background: "#E21B1B", width: "48%" }} />
                <div style={{ display: "flex", gap: "4px", margin: "6px 0 4px" }}>
                    <span style={{ width: "8px", height: "8px", background: "#E21B1B" }} />
                    <span style={{ width: "8px", height: "8px", background: "#565B60" }} />
                    <span style={{ width: "8px", height: "8px", border: "1px solid #181A1C" }} />
                </div>
                <span className={classes.barThin} style={{ background: "#E21B1B", width: "32%" }} />
                <span className={classes.line} style={{ background: "rgba(24,26,28,.35)" }} /><span className={classes.line} style={{ background: "rgba(24,26,28,.35)" }} />
                <span className={classes.barThin} style={{ background: "#181A1C", width: "40%", marginTop: "6px" }} />
                <span className={classes.line} style={{ background: "rgba(24,26,28,.35)" }} />
            </div>
        );
    }

    /* ---- IT ---- */
    if (id === "vector") {
        // edge-lit midnight circuit field
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#071326", padding: "12px 11px 12px 18px", gap: "4px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "2px", height: "26px", background: "#26D8FF", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#FFFFFF", width: "70%" }} />
                        <span className={classes.barThin} style={{ background: "#26D8FF", width: "52%" }} />
                    </div>
                    <div style={{ display: "flex", gap: "3px", alignItems: "center", marginTop: 4 }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#B8EF4A" }} />
                        <span style={{ width: "12px", height: "7px", borderRadius: "8px", border: "1px solid #26D8FF" }} />
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", border: "1px solid #26D8FF" }} />
                    </div>
                </div>
                <span className={classes.barThin} style={{ background: "#B8EF4A", width: "28%", marginTop: "8px" }} />
                <span className={classes.rule} style={{ background: "#3C6682" }} />
                <span className={classes.line} style={{ background: "#3C6682" }} /><span className={classes.line} style={{ background: "#3C6682" }} />
                <span className={classes.barThin} style={{ background: "#B8EF4A", width: "36%", marginTop: "6px" }} />
                <span className={classes.line} style={{ background: "#3C6682" }} /><span className={classes.line} style={{ background: "#3C6682" }} />
            </div>
        );
    }
    if (id === "kernel") {
        // bright blueprint + gold circular markers
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FAF8F2", padding: "12px 11px", gap: "4px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "3px", height: "28px", background: "#173A76", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#173A76", width: "68%" }} />
                        <span className={classes.barThin} style={{ background: "#2462B7", width: "46%" }} />
                    </div>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#D69B22", marginTop: 4 }} />
                </div>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D69B22", flexShrink: 0 }} />
                    <span className={classes.barThin} style={{ background: "#173A76", width: "30%" }} />
                </div>
                <span className={classes.rule} style={{ background: "#ACC5D8", marginLeft: "13px" }} />
                <span className={classes.line} style={{ background: "#E2E8EE", marginLeft: "13px" }} /><span className={classes.line} style={{ background: "#E2E8EE", marginLeft: "13px" }} />
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D69B22", flexShrink: 0 }} />
                    <span className={classes.barThin} style={{ background: "#173A76", width: "40%" }} />
                </div>
                <span className={classes.line} style={{ background: "#E2E8EE", marginLeft: "13px" }} />
            </div>
        );
    }
    if (id === "relay") {
        // dark signal-routing poster, red/orange modules
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#121416", padding: "12px 11px 12px 16px", gap: "4px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "3px", height: "26px", background: "#EE2525", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#F7F6F1", width: "58%" }} />
                        <span className={classes.barThin} style={{ background: "#F47B20", width: "50%" }} />
                    </div>
                    <div style={{ display: "flex", gap: "3px", alignItems: "center", marginTop: 3 }}>
                        <span style={{ width: "8px", height: "8px", background: "#EE2525" }} />
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F47B20" }} />
                        <span style={{ width: "11px", height: "7px", borderRadius: "8px", border: "1px solid #D6D9D9" }} />
                    </div>
                </div>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ width: "8px", height: "8px", background: "#EE2525", flexShrink: 0 }} />
                    <span className={classes.barThin} style={{ background: "#F47B20", width: "28%" }} />
                </div>
                <span className={classes.rule} style={{ background: "#596065", marginLeft: "13px" }} />
                <span className={classes.line} style={{ background: "#596065", marginLeft: "13px" }} /><span className={classes.line} style={{ background: "#596065", marginLeft: "13px" }} />
                <span className={classes.barThin} style={{ background: "#F47B20", width: "34%", marginTop: "6px", marginLeft: "13px" }} />
                <span className={classes.line} style={{ background: "#596065", marginLeft: "13px" }} />
            </div>
        );
    }
    if (id === "lattice") {
        // soft cloud systems: indigo/violet/coral orbits on paper
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FAFBFE", padding: "12px 11px", gap: "4px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "4px", height: "28px", background: "#26336D", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#26336D", width: "72%" }} />
                        <span className={classes.barThin} style={{ background: "#5B62BA", width: "54%" }} />
                    </div>
                    <div style={{ display: "flex", gap: "3px", alignItems: "center", marginTop: 4 }}>
                        <span style={{ width: "12px", height: "7px", borderRadius: "8px", border: "1px solid #8587D8" }} />
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#8DE6ED" }} />
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F37E71" }} />
                    </div>
                </div>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", border: "1.2px solid #8587D8", flexShrink: 0 }} />
                    <span className={classes.barThin} style={{ background: "#5B62BA", width: "28%" }} />
                </div>
                <span className={classes.rule} style={{ background: "#B9C4DC", marginLeft: "14px" }} />
                <span className={classes.line} style={{ background: "#D8DEEC", marginLeft: "14px" }} /><span className={classes.line} style={{ background: "#D8DEEC", marginLeft: "14px" }} />
                <span className={classes.barThin} style={{ background: "#5B62BA", width: "36%", marginTop: "6px", marginLeft: "14px" }} />
                <span className={classes.line} style={{ background: "#D8DEEC", marginLeft: "14px" }} />
            </div>
        );
    }

    /* ---- Classic ---- */
    if (id === "scribe") {
        // formal Word-style double keyline + navy seal
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FBFAF6", boxShadow: "inset 0 0 0 5px #FBFAF6, inset 0 0 0 6px #E7E6DF", padding: "14px 13px", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span className={classes.bar} style={{ background: "#1C2B3A", width: "62%" }} />
                        <span className={classes.barThin} style={{ background: "#34516A", width: "44%" }} />
                    </div>
                    <span style={{ width: "16px", height: "16px", border: "1.2px solid #34516A", borderRadius: "50%", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34516A" }} />
                    <span className={classes.barThin} style={{ background: "#34516A", width: "28%" }} />
                </div>
                <span className={classes.rule} style={{ background: "#C7CBC7", marginLeft: "12px" }} />
                <span className={classes.line} style={{ background: "#E2E2DC", marginLeft: "12px" }} /><span className={classes.line} style={{ background: "#E2E2DC", marginLeft: "12px" }} />
                <span className={classes.barThin} style={{ background: "#34516A", width: "38%", marginTop: "6px", marginLeft: "12px" }} />
                <span className={classes.line} style={{ background: "#E2E2DC", marginLeft: "12px" }} />
            </div>
        );
    }
    if (id === "regent") {
        // executive oxblood accents, broad margins, discreet signet
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FCFBF8", padding: "16px 14px", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span className={classes.bar} style={{ background: "#24201E", width: "58%" }} />
                        <span className={classes.barThin} style={{ background: "#733B43", width: "40%" }} />
                    </div>
                    <span style={{ width: "14px", height: "14px", border: "1.3px solid #A66B5B", borderRadius: "50%" }} />
                </div>
                <span className={classes.flank} style={{ background: "#BFB4AA", margin: "8px auto 2px" }} />
                <span className={classes.barThin} style={{ background: "#733B43", width: "30%", marginTop: "6px" }} />
                <span className={classes.rule} style={{ background: "#BFB4AA" }} />
                <span className={classes.line} style={{ background: "#E8E2DB" }} /><span className={classes.line} style={{ background: "#E8E2DB" }} />
                <span className={classes.barThin} style={{ background: "#733B43", width: "36%", marginTop: "6px" }} />
                <span className={classes.line} style={{ background: "#E8E2DB" }} />
            </div>
        );
    }
    if (id === "aldine") {
        // warm paper, forest hierarchy, old-world seal
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#F8F4EC", boxShadow: "inset 0 0 0 4px #F8F4EC, inset 0 0 0 5px #E3D9C9", padding: "14px 13px", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span className={classes.bar} style={{ background: "#2A3028", width: "60%" }} />
                        <span className={classes.barThin} style={{ background: "#486151", width: "42%" }} />
                    </div>
                    <span style={{ width: "15px", height: "15px", border: "1.2px solid #D7CCB8", borderRadius: "2px" }} />
                </div>
                <span className={classes.flank} style={{ background: "#D7CCB8", margin: "7px auto 2px" }} />
                <span className={classes.barThin} style={{ background: "#486151", width: "28%", marginTop: "6px" }} />
                <span className={classes.rule} style={{ background: "#D7CCB8" }} />
                <span className={classes.line} style={{ background: "#E3D9C9" }} /><span className={classes.line} style={{ background: "#E3D9C9" }} />
                <span className={classes.barThin} style={{ background: "#486151", width: "34%", marginTop: "6px" }} />
                <span className={classes.line} style={{ background: "#E3D9C9" }} />
            </div>
        );
    }
    if (id === "merit") {
        // cool diplomatic report: pale outline + steel top rule
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FAFAF8", boxShadow: "inset 0 0 0 4px #FAFAF8, inset 0 0 0 5px #CED4D5", padding: "12px 12px", gap: "4px" }}>
                <div style={{ height: "2.5px", background: "#4F6679", margin: "-12px -12px 10px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span className={classes.bar} style={{ background: "#262A31", width: "62%" }} />
                        <span className={classes.barThin} style={{ background: "#4F6679", width: "46%" }} />
                    </div>
                    <span style={{ width: "16px", height: "14px", border: "1px solid #4F6679" }} />
                </div>
                <span className={classes.rule} style={{ background: "#CED4D5", marginTop: "6px" }} />
                <span className={classes.barThin} style={{ background: "#4F6679", width: "26%", marginTop: "6px" }} />
                <span className={classes.rule} style={{ background: "#CED4D5" }} />
                <span className={classes.line} style={{ background: "#E9EEEE" }} /><span className={classes.line} style={{ background: "#E9EEEE" }} />
                <span className={classes.barThin} style={{ background: "#4F6679", width: "34%", marginTop: "6px" }} />
                <span className={classes.line} style={{ background: "#E9EEEE" }} />
            </div>
        );
    }

    /* ---- Sidebar ---- */
    if (id === "quarry") {
        // midnight network sidebar + cyan accent
        return (
            <div className={classes.paper} style={{ background: "#F7FAFC" }}>
                <div className={classes.sidebar} style={{ background: "linear-gradient(180deg, #0E1F30 0%, #13293D 55%, #1A3A52 100%)", borderRight: "2px solid #37D1EE" }}>
                    <span className={classes.lineLight} style={{ background: "rgba(55,209,238,.55)" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(183,216,75,.45)" }} />
                    <span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#13293D", width: "72%" }} />
                    <span className={classes.barThin} style={{ background: "#37D1EE", width: "48%" }} />
                    <span className={classes.rule} style={{ background: "#C7D5DE" }} />
                    <span className={classes.barThin} style={{ background: "#13293D", width: "34%", marginTop: "7px" }} />
                    <span className={classes.line} style={{ background: "#C7D5DE" }} /><span className={classes.line} style={{ background: "#C7D5DE" }} />
                </div>
            </div>
        );
    }
    if (id === "moss") {
        // botanical forest sidebar + gold rail
        return (
            <div className={classes.paper} style={{ background: "#FBFAF6" }}>
                <div className={classes.sidebar} style={{ background: "linear-gradient(180deg, #1E3428 0%, #274232 50%, #3A5A44 100%)", borderRight: "2px solid #B99854" }}>
                    <span className={classes.lineLight} style={{ background: "rgba(185,152,84,.55)" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(115,133,110,.5)" }} />
                    <span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#274232", width: "70%" }} />
                    <span className={classes.barThin} style={{ background: "#73856E", width: "46%" }} />
                    <span className={classes.rule} style={{ background: "#D5D0C2" }} />
                    <span className={classes.barThin} style={{ background: "#274232", width: "36%", marginTop: "7px" }} />
                    <span className={classes.line} style={{ background: "#D5D0C2" }} /><span className={classes.line} style={{ background: "#D5D0C2" }} />
                </div>
            </div>
        );
    }
    if (id === "garnet") {
        // burgundy art-déco sidebar + gold
        return (
            <div className={classes.paper} style={{ background: "#FBF8F5" }}>
                <div className={classes.sidebar} style={{ background: "linear-gradient(180deg, #4A1E28 0%, #722E3C 55%, #8A3A4A 100%)", borderRight: "2px solid #C7A66A" }}>
                    <span className={classes.lineLight} style={{ background: "rgba(244,222,222,.55)" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(199,166,106,.5)" }} />
                    <span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#2A2023", width: "68%" }} />
                    <span className={classes.barThin} style={{ background: "#C7A66A", width: "44%" }} />
                    <span className={classes.rule} style={{ background: "#DFCFC7" }} />
                    <span className={classes.barThin} style={{ background: "#722E3C", width: "36%", marginTop: "7px" }} />
                    <span className={classes.line} style={{ background: "#DFCFC7" }} /><span className={classes.line} style={{ background: "#DFCFC7" }} />
                </div>
            </div>
        );
    }
    if (id === "harbor") {
        // coastal navy sidebar + copper
        return (
            <div className={classes.paper} style={{ background: "#FAFBFB" }}>
                <div className={classes.sidebar} style={{ background: "linear-gradient(180deg, #152838 0%, #1D3446 50%, #2A4A60 100%)", borderRight: "2px solid #B78355" }}>
                    <span className={classes.lineLight} style={{ background: "rgba(234,240,243,.5)" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(183,131,85,.5)" }} />
                    <span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#1D3446", width: "70%" }} />
                    <span className={classes.barThin} style={{ background: "#B78355", width: "46%" }} />
                    <span className={classes.rule} style={{ background: "#CBD5D9" }} />
                    <span className={classes.barThin} style={{ background: "#1D3446", width: "38%", marginTop: "7px" }} />
                    <span className={classes.line} style={{ background: "#CBD5D9" }} /><span className={classes.line} style={{ background: "#CBD5D9" }} />
                </div>
            </div>
        );
    }

    /* ---- Banking ---- */
    if (id === "vault") {
        // private banking: deep green masthead + gold KPI band
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#F3F3ED" }}>
                <div style={{ height: "4px", background: "#143A32" }} />
                <div style={{ height: "26%", background: "#143A32", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 11px" }}>
                    <span className={classes.bar} style={{ background: "#FFFFFF", width: "58%" }} />
                    <span className={classes.barThin} style={{ background: "#C9D9D0", width: "50%" }} />
                </div>
                <div style={{ height: "3px", background: "#B79A56" }} />
                <div className={classes.col} style={{ paddingTop: 8 }}>
                    <div style={{ display: "flex", gap: "4px", marginBottom: "7px" }}>
                        {[0, 1, 2].map((i) => (
                            <span key={i} style={{ flex: 1, height: "16px", border: "1.1px solid #B79A56", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ width: "55%", height: "4px", background: "#143A32" }} />
                            </span>
                        ))}
                    </div>
                    <span className={classes.barThin} style={{ background: "#477466", width: "28%" }} />
                    <span className={classes.rule} style={{ background: "#B7C4BB" }} />
                    <span className={classes.line} style={{ background: "#D5DCD6" }} /><span className={classes.line} style={{ background: "#D5DCD6" }} />
                </div>
            </div>
        );
    }
    if (id === "clearing") {
        // operations: navy sidebar + cyan rail
        return (
            <div className={classes.paper} style={{ background: "#FBFCFE" }}>
                <div className={classes.sidebar} style={{ width: "28%", background: "#173F67", borderRight: "3px solid #48B8C8", paddingTop: "12px" }}>
                    <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "1.3px solid #48B8C8", marginBottom: "8px" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(185,232,235,.55)" }} />
                    <span className={classes.lineLight} style={{ background: "rgba(185,232,235,.4)" }} />
                    <span className={classes.lineLight} />
                </div>
                <div className={classes.main}>
                    <span className={classes.bar} style={{ background: "#173F67", width: "68%" }} />
                    <span className={classes.barThin} style={{ background: "#24889A", width: "52%" }} />
                    <div style={{ display: "flex", gap: "3px", margin: "6px 0 4px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #48B8C8" }} />
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #173F67" }} />
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #48B8C8" }} />
                    </div>
                    <span className={classes.barThin} style={{ background: "#24889A", width: "36%" }} />
                    <span className={classes.line} style={{ background: "#B5C7D8" }} /><span className={classes.line} style={{ background: "#B5C7D8" }} />
                </div>
            </div>
        );
    }
    if (id === "herald") {
        // wealth: burgundy double frame + centered masthead seals
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#FCF8F0", border: "1.5px solid #9D3341", boxShadow: "inset 0 0 0 3px #FCF8F0, inset 0 0 0 4px #CDBA97" }}>
                <div className={classes.centerCol} style={{ paddingTop: 10 }}>
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "1.3px solid #9D3341", marginBottom: "4px" }} />
                    <span className={classes.bar} style={{ background: "#312725", width: "56%" }} />
                    <span className={classes.barThin} style={{ background: "#9D3341", width: "48%" }} />
                    <div style={{ display: "flex", gap: "5px", margin: "8px 0 6px", width: "78%" }}>
                        {[0, 1, 2].map((i) => (
                            <span key={i} style={{ flex: 1, height: "14px", background: i === 1 ? "#CDBA97" : "#9D3341" }} />
                        ))}
                    </div>
                    <span className={classes.barThin} style={{ background: "#9D3341", width: "26%" }} />
                    <span className={classes.rule} style={{ background: "#CDBA97" }} />
                    <span className={classes.line} style={{ background: "#E5D9C8" }} /><span className={classes.line} style={{ background: "#E5D9C8" }} />
                </div>
            </div>
        );
    }
    if (id === "signal") {
        // risk/treasury dark field + teal radar nodes
        return (
            <div className={classes.paper} style={{ flexDirection: "column", background: "#101C26", padding: "10px 12px", gap: "4px" }}>
                <div style={{ height: "3px", background: "#3BD2C7", margin: "-10px -12px 10px" }} />
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                    <span style={{ width: "3px", height: "28px", background: "#3BD2C7", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={classes.bar} style={{ background: "#F2F7F6", width: "64%" }} />
                        <span className={classes.barThin} style={{ background: "#9DB7C3", width: "50%" }} />
                    </div>
                    <span style={{ width: "18px", height: "18px", borderRadius: "50%", border: "1.3px solid #3BD2C7", boxShadow: "inset 0 0 0 4px #173545" }} />
                </div>
                <div style={{ display: "flex", gap: "4px", margin: "6px 0 4px 9px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #3BD2C7" }} />
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #9DB7C3" }} />
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.2px solid #3BD2C7" }} />
                </div>
                <span className={classes.barThin} style={{ background: "#7BE1D9", width: "34%", marginLeft: "9px" }} />
                <span className={classes.rule} style={{ background: "#395263", marginLeft: "9px" }} />
                <span className={classes.line} style={{ background: "#395263", marginLeft: "9px" }} /><span className={classes.line} style={{ background: "#395263", marginLeft: "9px" }} />
            </div>
        );
    }

    /* ---- Darktheme ---- */
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

    // Fallback — should not hit for live TEMPLATES ids
    return (
        <div className={classes.paper}>
            <div className={classes.col}>
                <span className={classes.bar} style={{ background: "#16243A", width: "62%" }} />
                <span className={classes.rule} style={{ background: "#16243A" }} />
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
