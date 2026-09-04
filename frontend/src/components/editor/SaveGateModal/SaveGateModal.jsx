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

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title={importing ? "Import CV wymaga konta" : "Nie zgub swojej pracy"}
      subtitle={importing ? "Utwórz darmowe konto lub zaloguj się, aby wgrać CV w PDF."
        : "Utwórz darmowe konto, aby zapisać 1 CV i pobrać do 3 czystych PDF-ów miesięcznie"}
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button
            type="button"
            className={classes.ghost}
            onClick={() => navigate(`/login${authQuery}`)}
          >
            Mam już konto
          </button>
          <button
            type="button"
            className={classes.primary}
            onClick={() => navigate(`/register${authQuery}`)}
          >
            Utwórz konto
          </button>
        </div>
      )}
    >
      <p className={classes.copy}>
        {importing ? "Darmowe konto pozwala zaimportować jedno CV miesięcznie. Obecny dokument pozostaje bez zmian."
          : "Twoje CV jest już na płótnie. Po zalogowaniu możesz wczytać ten szkic i zapisać go na koncie."}
      </p>
    </DialogShell>
  );
}
