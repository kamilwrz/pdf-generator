/**
 * Account gate for guest persistence and CV import. Import links retain the
 * start intent through registration/login; the upload UI never mounts here.
 * Existing browser drafts can be claimed after login and explicitly saved.
 */
import { useNavigate } from "react-router-dom";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./SaveGateModal.module.css";

export default function SaveGateModal({ open, onCancel, purpose = "save" }) {
  const navigate = useNavigate();
  const importing = purpose === "import";
  const authQuery = importing ? "?start=import" : "";
  const content = importing
    ? {
      eyebrow: "Import CV",
      title: "Kontynuuj import na swoim koncie",
      subtitle: "Po zalogowaniu lub rejestracji od razu wrócisz do importu i wybierzesz plik PDF.",
      lead: "Na tym etapie nie wybieramy pliku i nie zmieniamy obecnego dokumentu.",
      facts: [
        { value: "1 import", label: "pliku PDF miesięcznie" },
        { value: "Bez zmian", label: "w obecnym szkicu" },
      ],
    }
    : {
      eyebrow: "Zapis CV",
      title: "Zapisz szkic na swoim koncie",
      subtitle: "Bieżąca praca pozostanie dostępna, gdy przejdziesz do logowania lub rejestracji.",
      lead: "Darmowe konto pozwala zachować postęp i pobierać gotowe dokumenty bez znaku wodnego.",
      facts: [
        { value: "1 CV", label: "zapisane na koncie" },
        { value: "3 pliki PDF", label: "do pobrania miesięcznie" },
      ],
    };

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={620}
      variant="decision"
      surface="paper"
      eyebrow={content.eyebrow}
      title={content.title}
      subtitle={content.subtitle}
      initialFocusSelector="[data-primary-action]"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.cancel} onClick={onCancel}>
            Wróć do edytora
          </button>
          <div className={classes.accountActions}>
            <button
              type="button"
              className={classes.secondary}
              onClick={() => navigate(`/login${authQuery}`)}
            >
              Zaloguj się
            </button>
            <button
              type="button"
              className={classes.primary}
              data-primary-action=""
              onClick={() => navigate(`/register${authQuery}`)}
            >
              Utwórz darmowe konto
            </button>
          </div>
        </div>
      )}
    >
      <div className={classes.content}>
        <p className={classes.lead}>{content.lead}</p>
        <dl className={classes.facts} aria-label="Zakres darmowego konta">
          {content.facts.map((fact, index) => (
            <div className={classes.fact} key={fact.value}>
              <dt>
                <span aria-hidden="true">0{index + 1}</span>
                {fact.value}
              </dt>
              <dd>{fact.label}</dd>
            </div>
          ))}
        </dl>
        <p className={classes.reassurance}>
          {importing
            ? "Zachowamy zamiar importu, więc po autoryzacji nie trzeba zaczynać od początku."
            : "Szkic jest również zapisany lokalnie w tej przeglądarce."}
        </p>
      </div>
    </DialogShell>
  );
}
