import { useState } from "react";
import { useScopedAi } from "../../../store/scoped-ai-context";
import { useCanvasContext } from "../../../store/canvas-context";
import { useDocumentLifecycle } from "../../../store/document-lifecycle-context";
import { buildScopedAiSnapshot, scopedCorrectionsToPatches, SCOPED_AI_ACTIONS, scopedLengthSummary } from "../../../utils/scopedAi";
import { syncCvDataFromCanvas } from "../../../utils/syncCvDataFromCanvas";
import classes from "./ScopedAiReview.module.css";

/** Inline before/after review; never mounts a separate window or document node.
 * Retains results across template changes but validates the original epoch and
 * source text before allowing an atomic, undoable application to the canvas.
 */
export default function ScopedAiReview({ review }) {
  const canvas = useCanvasContext();
  const { isDocumentScopeCurrent } = useDocumentLifecycle();
  const { isAvailable, setReview, open, send } = useScopedAi();
  const [notice, setNotice] = useState("");
  const currentSnapshot = review ? buildScopedAiSnapshot(canvas.A4_Elements, review.snapshot.target, canvas.pageSize?.height) : null;
  const stale = Boolean(review && (currentSnapshot.signature !== review.snapshot.signature
    || !isDocumentScopeCurrent(review.documentScope)));
  const pending = (review?.corrections || []).filter((correction) =>
    !review.accepted?.includes(correction.fragment_id) && !review.rejected?.includes(correction.fragment_id));

  const apply = (corrections) => {
    if (!isAvailable || stale || !corrections.length) return;
    try {
      const patches = scopedCorrectionsToPatches(canvas.A4_Elements, review.snapshot, corrections);
      const result = canvas.applyScopedTextPatches(patches);
      if (!result) throw new Error("Treść zmieniła się od analizy. Wygeneruj propozycję ponownie.");
      canvas.setActiveCvData((profile) => syncCvDataFromCanvas(profile, result.before, result.after));
      const snapshot = buildScopedAiSnapshot(result.after, review.snapshot.target, canvas.pageSize?.height);
      setReview({ ...review, snapshot, accepted: [...review.accepted, ...corrections.map((c) => c.fragment_id)] });
      setNotice("Zastosowano propozycję. Zmianę możesz cofnąć przyciskiem Cofnij w edytorze.");
    } catch (error) { setNotice(error.message); }
  };

  const actionLabel = SCOPED_AI_ACTIONS.find((action) => action.id === review.action)?.label || "AI";
  return <section className={classes.review} aria-label={`${actionLabel} z AI: ${review.snapshot.title}`} data-scoped-ai-review="true">
    <h2 className={classes.title}>{actionLabel} z AI</h2>
    <p>{review.snapshot.title}</p>
        <p className={classes.note}>Analizujemy tylko wybrany zakres. Sprawdź znaczenie propozycji przed zastosowaniem.</p>
        <div role="status" aria-live="polite">{review.status === "loading" && !stale ? `Trwa operacja: ${actionLabel.toLocaleLowerCase()}…` : notice}</div>
        {review.error ? <p role="alert">{review.error}</p> : null}
        {review.status === "error" && !stale ? <button className={classes.button} onClick={() => send(review)}>Ponów żądanie</button> : null}
        {stale ? <div role="status"><p>Analizowana treść lub jej kontekst zmieniły się. Propozycja jest nieaktualna.</p>
          {isDocumentScopeCurrent(review.documentScope)
            ? <button className={classes.button} onClick={(event) => open(review.snapshot.target, review.action, event.currentTarget)}>Wygeneruj ponownie</button>
            : <p>Wybierz sekcję lub wpis w aktualnym szablonie, aby ponowić analizę.</p>}</div> : null}
        {review.status === "ready" ? <>
          <p>{review.response.message}</p>
          {!review.corrections.length ? <p>Brak zmian do zastosowania. AI nie znalazło bezpiecznej poprawki.</p> : null}
          {review.corrections.map((correction) => {
            const accepted = review.accepted.includes(correction.fragment_id);
            const rejected = review.rejected.includes(correction.fragment_id);
            return <article className={classes.correction} key={correction.fragment_id}>
              <h3>{review.snapshot.sources.find((source) => source.id === correction.fragment_id)?.kind === "skill" ? "Umiejętność" : "Opis"}</h3>
              <dl><dt>Przed</dt><dd>{correction.before}</dd><dt>Po</dt><dd>{correction.content}</dd></dl>
              <p className={classes.note}>{scopedLengthSummary(correction.before, correction.content)}</p>
              {accepted || rejected ? <p>{accepted ? "Zastosowano" : "Odrzucono"}</p> : <div className={classes.actions}>
                <button className={classes.button} disabled={stale} onClick={() => apply([correction])}>Zastosuj</button>
                <button className={classes.button} onClick={() => setReview({ ...review, rejected: [...review.rejected, correction.fragment_id] })}>Odrzuć</button>
              </div>}
            </article>;
          })}
          {(review.response.achievement_templates || []).map((example, index) => <article className={classes.correction} key={`${example.fragment_id}-${index}`}>
            <h3>Wzór do uzupełnienia</h3><p>Ten wzór nie jest stosowany do CV.</p><p className={classes.example}>{example.template}</p>
            <ul>{example.questions.map((question, i) => <li key={i}>{question}</li>)}</ul>
            <button className={classes.button} onClick={async () => {
              try { await navigator.clipboard.writeText(example.template); setNotice("Skopiowano wzór do uzupełnienia."); }
              catch { setNotice("Nie udało się skopiować. Zaznacz tekst wzoru i skopiuj go ręcznie."); }
            }}>Kopiuj wzór</button>
          </article>)}
        </> : null}
    {pending.length > 0 ? <button className={classes.primary} disabled={stale || !isAvailable} onClick={() => apply(pending)}>Zastosuj wszystkie</button> : null}
  </section>;
}
