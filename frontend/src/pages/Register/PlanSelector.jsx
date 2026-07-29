/**
 * Plan radio group used on the register form.
 */
const PLANS = [
    { slug: "free", name: "Free", note: "0 zł · bez kredytów AI" },
    { slug: "standard", name: "Standard", note: "29 zł · 150 kredytów AI" },
    { slug: "premium", name: "Premium", note: "49 zł · 300 kredytów AI" },
];

export default function PlanSelector({ value, onChange, classes, disabled }) {
    return (
        <div className={classes.planSelector} role="radiogroup" aria-label="Wybierz plan">
            {PLANS.map((plan) => (
                <button
                    type="button"
                    key={plan.slug}
                    role="radio"
                    aria-checked={value === plan.slug}
                    disabled={disabled}
                    className={`${classes.planOption} ${value === plan.slug ? classes.planOptionActive : ""}`}
                    onClick={() => onChange(plan.slug)}
                >
                    <span className={classes.planOptionName}>{plan.name}</span>
                    <span className={classes.planOptionNote}>{plan.note}</span>
                </button>
            ))}
        </div>
    );
}

export const PLAN_SLUGS = PLANS.map((p) => p.slug);
