/**
 * Shown when a guest (no account) clicks "Zapisz PDF". Explains that their
 * work is already on the canvas and offers to create an account or sign in
 * — after which PdfCanvas's claim effect saves the document automatically
 * and re-enables "Pobierz PDF" without the visitor re-entering anything.
 */
import { useNavigate } from "react-router-dom";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./SaveGateModal.module.css";

export default function SaveGateModal({ open, onCancel }) {
  const navigate = useNavigate();

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      radius={2}
      title="Nie zgub swojej pracy"
      subtitle="Utwórz darmowe konto, aby zapisać CV i pobrać gotowy PDF"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button
            type="button"
            className={classes.ghost}
            onClick={() => navigate("/login")}
          >
            Mam już konto
          </button>
          <button
            type="button"
            className={classes.primary}
            onClick={() => navigate("/register")}
          >
            Utwórz konto
          </button>
        </div>
      )}
    >
      <p className={classes.copy}>
        Twoje CV jest już na płótnie. Po utworzeniu konta zapiszemy je
        automatycznie i wrócisz dokładnie do tego samego dokumentu.
      </p>
    </DialogShell>
  );
}
