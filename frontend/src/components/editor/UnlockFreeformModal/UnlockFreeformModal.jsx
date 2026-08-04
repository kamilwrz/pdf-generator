/**
 * Confirm converting a template document into a freeform project (via copy).
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./UnlockFreeformModal.module.css";

export default function UnlockFreeformModal({ open, onCancel, onConfirm }) {
  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title="Odblokuj swobodną edycję"
      subtitle="Przejście z trybu szablonu do projektu własnego"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className={classes.primary} onClick={onConfirm}>
            Utwórz kopię i odblokuj
          </button>
        </div>
      )}
    >
      <p className={classes.copy}>
        Ten dokument zostanie przekształcony w projekt swobodny. Elementy będzie
        można dowolnie przesuwać, ale automatyczne dopasowanie szablonu zostanie
        wyłączone.
      </p>
      <p className={classes.note}>
        Tworzymy kopię, żebyś mógł wrócić do wersji szablonowej.
      </p>
    </DialogShell>
  );
}
