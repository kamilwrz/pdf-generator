/**
 * Account gate for guest save, download, and CV-import intents.
 *
 * Each intent explains its actual side effect: saving persists the project,
 * downloading only hands a rendered PDF to the browser, and importing returns
 * to the protected upload flow. Existing browser drafts remain local until the
 * user explicitly claims and saves them after authentication.
 */
import { useNavigate } from "react-router-dom";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./SaveGateModal.module.css";

const CONTENT_BY_PURPOSE = {
  import: {
    eyebrow: "Import CV",
    title: "Kontynuuj import na swoim koncie",
    subtitle: "Po zalogowaniu lub rejestracji od razu wrócisz do importu i wybierzesz plik PDF.",
    lead: "Na tym etapie nie wybieramy pliku i nie zmieniamy obecnego dokumentu.",
    facts: [
      { value: "1 import", label: "pliku PDF miesięcznie" },
      { value: "Bez zmian", label: "w obecnym szkicu" },
    ],
    reassurance: "Zachowamy zamiar importu, więc po autoryzacji nie trzeba zaczynać od początku.",
  },
  download: {
    eyebrow: "Pobieranie PDF",
    title: "Pobierz CV jako plik PDF",
    subtitle: "Po zalogowaniu lub rejestracji możesz wygenerować PDF z bieżącego szkicu i pobrać go na to urządzenie.",
    lead: "Pobranie nie zapisuje CV w „Moich dokumentach” ani nie zmienia szkicu w edytorze.",
    facts: [
      { value: "3 pliki PDF", label: "do pobrania miesięcznie" },
      { value: "Bez znaku wodnego", label: "w każdym pobranym pliku" },
    ],
    reassurance: "Szkic pozostaje zapisany lokalnie w tej przeglądarce.",
  },
  save: {
    eyebrow: "Zapis CV",
    title: "Zapisz szkic na swoim koncie",
    subtitle: "Bieżąca praca pozostanie dostępna, gdy przejdziesz do logowania lub rejestracji.",
    lead: "Darmowe konto pozwala zachować postęp i pobierać gotowe dokumenty bez znaku wodnego.",
    facts: [
      { value: "1 CV", label: "zapisane na koncie" },
      { value: "3 pliki PDF", label: "do pobrania miesięcznie" },
    ],
    reassurance: "Szkic jest również zapisany lokalnie w tej przeglądarce.",
  },
};

export default function SaveGateModal({ open, onCancel, purpose = "save" }) {
  const navigate = useNavigate();
  const importing = purpose === "import";
  const authQuery = importing ? "?start=import" : "";
  const content = CONTENT_BY_PURPOSE[purpose] ?? CONTENT_BY_PURPOSE.save;

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
        <p className={classes.reassurance}>{content.reassurance}</p>
      </div>
    </DialogShell>
  );
}
