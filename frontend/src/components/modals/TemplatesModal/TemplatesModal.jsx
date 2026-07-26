import { use } from "react";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";

// Real cropped screenshot of the template's own canvas data — see
// frontend/public/template-mockups/. Card aspect ratio matches A4 portrait.
function Preview({ id, name }) {
    return (
        <div className={classes.paper}>
            <img className={classes.previewImg} src={`/template-mockups/${id}.png`} alt={name} loading="lazy" />
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
                            <Preview id={t.id} name={t.name} />
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
