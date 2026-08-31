/**
 * In-app plan picker. Activates plans via billing API when unpaid selection is
 * allowed; otherwise surfaces payment_required for future Stripe Checkout.
 *
 * Catalog is Free + Pro (30-day pass). Legacy Standard/Premium slugs are
 * remapped to Pro on the backend.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import classes from "./PlanSelectModal.module.css";
import DialogShell from "../../common/DialogShell/DialogShell";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { useSession } from "../../../store/session-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { planErrorMessage } from "../../../utils/entitlements";
import {
    applyPlanPresentation,
    FALLBACK_PLAN_CATALOG,
} from "../../../utils/planPresentation";

export default function PlanSelectModal() {
    const { isPlanModal, showPlanModal } = useUiSurfaces();
    const { entitlements, refreshEntitlements, pushToast } = useSession();

    const api = useMemo(
        () => new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

    const [plans, setPlans] = useState(FALLBACK_PLAN_CATALOG);
    const [currentSlug, setCurrentSlug] = useState(entitlements?.plan_slug || "free");
    const [pendingSlug, setPendingSlug] = useState(null);
    const [catalogState, setCatalogState] = useState("idle");

    useEffect(() => {
        if (!isPlanModal) return;
        let cancelled = false;
        setCatalogState("loading");
        api.httpRequest(ENDPOINTS.BILLING.PLANS, "GET", null, "Nie udało się pobrać planów.")
            .then((data) => {
                if (cancelled) return;
                if (Array.isArray(data.plans) && data.plans.length) {
                    const bySlug = new Map(data.plans.map((plan) => [plan.slug, plan]));
                    setPlans(FALLBACK_PLAN_CATALOG.map((fallback) => applyPlanPresentation({
                        ...fallback,
                        ...(bySlug.get(fallback.slug) || {}),
                    })));
                }
                if (data.current_plan_slug) setCurrentSlug(data.current_plan_slug);
                setCatalogState("ready");
            })
            .catch(() => {
                if (!cancelled) {
                    setPlans(FALLBACK_PLAN_CATALOG);
                    setCurrentSlug(entitlements?.plan_slug || "free");
                    setCatalogState("fallback");
                }
            });
        return () => { cancelled = true; };
    }, [api, entitlements?.plan_slug, isPlanModal]);

    const handleSelect = useCallback(async (slug) => {
        if (!slug || slug === currentSlug || pendingSlug) return;
        setPendingSlug(slug);
        try {
            const res = await api.httpRequest(
                ENDPOINTS.BILLING.SELECT_PLAN,
                "POST",
                JSON.stringify({ plan_slug: slug }),
                "Nie udało się zmienić planu.",
            );
            if (res.payment_required && res.checkout_url) {
                window.location.assign(res.checkout_url);
                return;
            }
            if (res.entitlements) {
                await refreshEntitlements?.();
                setCurrentSlug(res.plan_slug);
            } else {
                await refreshEntitlements?.();
                setCurrentSlug(slug);
            }
            pushToast?.({
                title: "Plan zaktualizowany",
                msg: `Aktywowano plan ${res.entitlements?.plan_name || slug}.`,
                variant: "success",
            });
            showPlanModal?.();
        } catch (error) {
            if (error?.code === "payment_required") {
                pushToast?.({
                    title: "Wymagana płatność",
                    msg: planErrorMessage(error, "Ten plan wymaga płatności (Stripe wkrótce)."),
                    variant: "error",
                });
            } else {
                pushToast?.({
                    title: "Nie udało się zmienić planu",
                    msg: planErrorMessage(error, error.message || "Spróbuj ponownie."),
                    variant: "error",
                });
            }
        } finally {
            setPendingSlug(null);
        }
    }, [api, currentSlug, pendingSlug, pushToast, refreshEntitlements, showPlanModal]);

    return (
        <DialogShell
            open={Boolean(isPlanModal)}
            onClose={() => showPlanModal?.()}
            width={960}
            title="Twój plan"
            subtitle="Darmowy wystarcza do jednego kompletnego CV. Pro daje więcej wersji, wszystkie szablony i narzędzia AI."
        >
            <p className={classes.catalogStatus} role="status" aria-live="polite">
                {catalogState === "loading"
                    ? "Pobieramy aktualne dane planów…"
                    : catalogState === "fallback"
                        ? "Nie udało się odświeżyć cennika. Pokazujemy aktualne zasady zapisane w aplikacji."
                        : "\u00A0"}
            </p>
            <div className={classes.grid}>
                {plans.map((plan) => {
                    const active = plan.slug === currentSlug;
                    const busy = pendingSlug === plan.slug;
                    const priceUnit = plan.slug === "pro" ? "zł / 30 dni" : "zł";
                    return (
                        <article
                            key={plan.slug}
                            className={`${classes.card} ${active ? classes.cardActive : ""}`}
                            aria-label={`Plan ${plan.name}${active ? ", aktualny" : ""}`}
                        >
                            <header className={classes.cardHead}>
                                <h3 className={classes.planName}>{plan.name}</h3>
                                {active ? <span className={classes.currentPill}>Aktualny</span> : null}
                                {!active && plan.badge ? (
                                    <span className={classes.badgePill}>{plan.badge}</span>
                                ) : null}
                            </header>
                            <div className={classes.priceRow}>
                                <span className={classes.price}>{plan.price_pln ?? 0}</span>
                                <span className={classes.currency}>{priceUnit}</span>
                            </div>
                            <p className={classes.blurb}>{plan.blurb}</p>
                            <ul className={classes.features}>
                                {(plan.highlights || []).map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                            {plan.period_note ? (
                                <p className={classes.periodNote}>{plan.period_note}</p>
                            ) : null}
                            <button
                                type="button"
                                className={active ? classes.btnCurrent : classes.btnSelect}
                                disabled={active || Boolean(pendingSlug) || catalogState === "loading"}
                                onClick={() => handleSelect(plan.slug)}
                                aria-busy={busy}
                            >
                                {busy
                                    ? "Aktywuję…"
                                    : (active
                                        ? "Twój plan"
                                        : (plan.cta || `Wybierz ${plan.name}`))}
                            </button>
                        </article>
                    );
                })}
            </div>
        </DialogShell>
    );
}
