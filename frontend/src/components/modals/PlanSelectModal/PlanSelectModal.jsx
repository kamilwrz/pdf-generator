import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * In-app plan picker. Local development may activate plans through the
 * explicit bypass; production Pro selection redirects to hosted Checkout.
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

/** Accept only the hosted Stripe origin returned by this application's API. */
function hostedCheckoutUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "checkout.stripe.com" ? url.href : null;
    } catch {
        return null;
    }
}

export default function PlanSelectModal() {
  useTranslation();
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
        // Schedule the loading transition after the effect commit. This keeps
        // React's effect phase free of synchronous state cascades.
        queueMicrotask(() => {
            if (!cancelled) setCatalogState("loading");
        });
        api.httpRequest(ENDPOINTS.BILLING.PLANS, "GET", null, uiText("account:planSelectModal.couldNotLoadPlans"))
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
                uiText("account:planSelectModal.couldNotChangePlan"),
                {
                    headers: {
                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}`,
                    },
                },
            );
            if (res.payment_required) {
                const checkoutUrl = hostedCheckoutUrl(res.checkout_url);
                if (!checkoutUrl) {
                    throw new Error(uiText("account:planSelectModal.theServerDidNotReturnAValid"));
                }
                window.location.assign(checkoutUrl);
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
                title: uiText("account:planSelectModal.planUpdated"),
                msg: uiText("account:planSelectModal.planActivated", { value0: (res.entitlements?.plan_name || slug) }),
                variant: "success",
            });
            showPlanModal?.();
        } catch (error) {
            if (error?.code === "payment_required") {
                pushToast?.({
                    title: uiText("account:planSelectModal.paymentRequired"),
                    msg: planErrorMessage(error, uiText("account:planSelectModal.couldNotStartSecurePayment")),
                    variant: "error",
                });
            } else {
                pushToast?.({
                    title: uiText("account:planSelectModal.couldNotChangePlan2"),
                    msg: planErrorMessage(error, error.message || uiText("account:planSelectModal.pleaseTryAgain")),
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
            title={uiText("account:planSelectModal.yourPlan")}
            subtitle={uiText("account:planSelectModal.freeIsEnoughForOneCompleteCv")}
        >
            <p className={classes.catalogStatus} role="status" aria-live="polite">
                {catalogState === "loading"
                    ? uiText("account:planSelectModal.loadingCurrentPlanDetails")
                    : catalogState === "fallback"
                        ? uiText("account:planSelectModal.couldNotRefreshPricingShowingCurrentTerms")
                        : "\u00A0"}
            </p>
            <div className={classes.grid}>
                {plans.map((plan) => {
                    const active = plan.slug === currentSlug;
                    const busy = pendingSlug === plan.slug;
                    const priceUnit = plan.slug === "pro" ? uiText("account:planSelectModal.plnDays") : uiText("account:planSelectModal.pln");
                    return (
                        <article
                            key={plan.slug}
                            className={`${classes.card} ${active ? classes.cardActive : ""}`}
                            aria-label={`Plan ${plan.name}${active ? ", aktualny" : ""}`}
                        >
                            <header className={classes.cardHead}>
                                <h3 className={classes.planName}>{plan.name}</h3>
                                {active ? <span className={classes.currentPill}>{uiText("account:planSelectModal.current")}</span> : null}
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
                                    ? uiText("account:planSelectModal.activating")
                                    : (active
                                        ? uiText("account:planSelectModal.yourPlan")
                                        : (plan.cta || uiText("account:planSelectModal.choose", { value0: (plan.name) })))}
                            </button>
                        </article>
                    );
                })}
            </div>
        </DialogShell>
    );
}
