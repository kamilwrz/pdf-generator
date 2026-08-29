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

const FALLBACK_PLANS = [
    {
        slug: "free",
        name: "Darmowy",
        price_pln: 0,
        price_label: "0 zł",
        blurb: "Stwórz i sprawdź swoje CV.",
        highlights: [
            "Kreator i pełna edycja A4",
            "2 podstawowe szablony",
            "3 importy CV / mies.",
            "PDF ze znakiem CV Studio",
            "1 zapisany dokument · 3 eksporty / mies.",
        ],
        period_note: "Bez karty. Bez zobowiązań.",
        cta: "Stwórz CV za darmo",
    },
    {
        slug: "pro",
        name: "Pro",
        price_pln: 59,
        price_label: "59 zł / 30 dni",
        blurb: "Gotowe CV do wysłania.",
        highlights: [
            "PDF bez znaku wodnego",
            "Wszystkie 10 szablonów",
            "Importy CV bez limitu",
            "AI do treści, ATS i układu",
            "200 kredytów AI · wiele wersji CV",
        ],
        period_note: "Jedna płatność · Bez automatycznego odnawiania",
        badge: "Najlepszy wybór do szukania pracy",
        cta: "Odblokuj Pro",
    },
];

export default function PlanSelectModal() {
    const { isPlanModal, showPlanModal } = useUiSurfaces();
    const { entitlements, refreshEntitlements, pushToast } = useSession();

    const api = useMemo(
        () => new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

    const [plans, setPlans] = useState(FALLBACK_PLANS);
    const [currentSlug, setCurrentSlug] = useState(entitlements?.plan_slug || "free");
    const [pendingSlug, setPendingSlug] = useState(null);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    useEffect(() => {
        if (!isPlanModal) return;
        let cancelled = false;
        setLoadingCatalog(true);
        api.httpRequest(ENDPOINTS.BILLING.PLANS, "GET", null, "Nie udało się pobrać planów.")
            .then((data) => {
                if (cancelled) return;
                if (Array.isArray(data.plans) && data.plans.length) setPlans(data.plans);
                if (data.current_plan_slug) setCurrentSlug(data.current_plan_slug);
            })
            .catch(() => {
                if (!cancelled) setCurrentSlug(entitlements?.plan_slug || "free");
            })
            .finally(() => {
                if (!cancelled) setLoadingCatalog(false);
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
            radius={2}
            title="Twój plan"
            subtitle="Darmowy do stworzenia i sprawdzenia CV. Pro — gotowe CV do wysłania (30 dni, jedna płatność)."
        >
            <div className={classes.grid}>
                {plans.map((plan) => {
                    const active = plan.slug === currentSlug;
                    const busy = pendingSlug === plan.slug;
                    const priceUnit = plan.slug === "pro" ? "zł / 30 dni" : "zł";
                    return (
                        <article
                            key={plan.slug}
                            className={`${classes.card} ${active ? classes.cardActive : ""}`}
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
                                disabled={active || Boolean(pendingSlug) || loadingCatalog}
                                onClick={() => handleSelect(plan.slug)}
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
