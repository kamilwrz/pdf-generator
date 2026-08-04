/**
 * In-app plan picker. Activates plans via billing API when unpaid selection is
 * allowed; otherwise surfaces payment_required for future Stripe Checkout.
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
        name: "Free",
        price_pln: 0,
        blurb: "Edytor, wybrane szablony i eksport PDF.",
        highlights: ["8 szablonów startowych", "1 projekt · 3 eksporty / mies.", "Bez Asystenta AI"],
    },
    {
        slug: "standard",
        name: "Standard",
        price_pln: 29,
        blurb: "Analizy AI treści i pełna biblioteka szablonów.",
        highlights: ["150 kredytów AI / mies.", "CV, projekt, dopasowanie, gramatyka, styl i ATS", "Wszystkie 26 szablonów", "10 projektów · 30 eksportów / mies."],
    },
    {
        slug: "premium",
        name: "Premium",
        price_pln: 49,
        blurb: "Tryb Układ AI i bez limitów projektów.",
        highlights: ["300 kredytów AI / mies.", "Tryb Układ: geometria i propozycje zmian", "Wszystkie 26 szablonów", "Bez limitu projektów i eksportów"],
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
            width={1280}
            radius={2}
            title="Twój plan"
            subtitle="Zmień pakiet w dowolnym momencie. Płatności Stripe dołączymy później — teraz aktywacja jest natychmiastowa."
        >
            <div className={classes.grid}>
                {plans.map((plan) => {
                    const active = plan.slug === currentSlug;
                    const busy = pendingSlug === plan.slug;
                    return (
                        <article
                            key={plan.slug}
                            className={`${classes.card} ${active ? classes.cardActive : ""}`}
                        >
                            <header className={classes.cardHead}>
                                <h3 className={classes.planName}>{plan.name}</h3>
                                {active ? <span className={classes.currentPill}>Aktualny</span> : null}
                            </header>
                            <div className={classes.priceRow}>
                                <span className={classes.price}>{plan.price_pln ?? 0}</span>
                                <span className={classes.currency}>zł / mies.</span>
                            </div>
                            <p className={classes.blurb}>{plan.blurb}</p>
                            <ul className={classes.features}>
                                {(plan.highlights || []).map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                className={active ? classes.btnCurrent : classes.btnSelect}
                                disabled={active || Boolean(pendingSlug) || loadingCatalog}
                                onClick={() => handleSelect(plan.slug)}
                            >
                                {busy ? "Aktywuję…" : (active ? "Twój plan" : `Wybierz ${plan.name}`)}
                            </button>
                        </article>
                    );
                })}
            </div>
            <p className={classes.note}>1 kredyt AI ≈ 5 gr. Limity odświeżają się co miesiąc kalendarzowy.</p>
        </DialogShell>
    );
}
