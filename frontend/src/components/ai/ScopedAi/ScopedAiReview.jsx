import { useMessageState, messageRef, messageOf, resolveMessage } from '../../../i18n/messageState.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
  useTranslation();
  const canvas = useCanvasContext();
  const { isDocumentScopeCurrent } = useDocumentLifecycle();
  const { isAvailable, setReview, open, send } = useScopedAi();
  const [notice, setNotice] = useMessageState("");
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
      if (!result) throw new Error(uiText("ai:scopedAiReview.theContentHasChangedSinceAnalysisGenerate"));
      canvas.setActiveCvData((profile) => syncCvDataFromCanvas(profile, result.before, result.after));
      const snapshot = buildScopedAiSnapshot(result.after, review.snapshot.target, canvas.pageSize?.height);
      setReview({ ...review, snapshot, accepted: [...review.accepted, ...corrections.map((c) => c.fragment_id)] });
      setNotice(messageRef("ai:scopedAiReview.suggestionAppliedYouCanUndoItUsing"));
    } catch (error) { setNotice(messageOf(error)); }
  };

  const actionLabel = SCOPED_AI_ACTIONS.find((action) => action.id === review.action)?.label || "AI";
  return <section className={classes.review} aria-label={uiText("ai:scopedReview.title", { action: actionLabel, title: review.snapshot.title })} data-scoped-ai-review="true">
    <h2 className={classes.title}>{uiText("ai:scopedReview.action", { action: actionLabel })}</h2>
    <p>{review.snapshot.title}</p>
        <p className={classes.note}>{uiText("ai:scopedAiReview.onlyTheSelectedScopeIsBeingAnalysed")}</p>
        <div role="status" aria-live="polite">{review.status === "loading" && !stale ? uiText("ai:scopedReview.pending", { action: actionLabel }) : notice}</div>
        {review.error ? <p role="alert">{resolveMessage(review.error)}</p> : null}
        {review.status === "error" && !stale ? <button className={classes.button} onClick={() => send(review)}>{uiText("ai:scopedAiReview.retryRequest")}</button> : null}
        {stale ? <div role="status"><p>{uiText("ai:scopedAiReview.theAnalysedContentOrItsContextHas")}</p>
          {isDocumentScopeCurrent(review.documentScope)
            ? <button className={classes.button} onClick={(event) => open(review.snapshot.target, review.action, event.currentTarget)}>{uiText("ai:scopedAiReview.generateAgain")}</button>
            : <p>{uiText("ai:scopedAiReview.chooseASectionOrEntryInThe")}</p>}</div> : null}
        {review.status === "ready" ? <>
          <p>{review.response.message}</p>
          {!review.corrections.length ? <p>{uiText("ai:scopedAiReview.noChangesToApplyAiFoundNo")}</p> : null}
          {review.corrections.map((correction) => {
            const accepted = review.accepted.includes(correction.fragment_id);
            const rejected = review.rejected.includes(correction.fragment_id);
            return <article className={classes.correction} key={correction.fragment_id}>
              <h3>{review.snapshot.sources.find((source) => source.id === correction.fragment_id)?.kind === "skill" ? uiText("ai:scopedAiReview.skill") : "Opis"}</h3>
              <dl><dt>{uiText("ai:aiAssistant.before")}</dt><dd>{correction.before}</dd><dt>Po</dt><dd>{correction.content}</dd></dl>
              <p className={classes.note}>{scopedLengthSummary(correction.before, correction.content)}</p>
              {accepted || rejected ? <p>{accepted ? "Zastosowano" : "Odrzucono"}</p> : <div className={classes.actions}>
                <button className={classes.button} disabled={stale} onClick={() => apply([correction])}>{uiText("ai:aiAssistant.apply")}</button>
                <button className={classes.button} onClick={() => setReview({ ...review, rejected: [...review.rejected, correction.fragment_id] })}>{uiText("ai:aiAssistant.reject")}</button>
              </div>}
            </article>;
          })}
          {(review.response.achievement_templates || []).map((example, index) => <article className={classes.correction} key={`${example.fragment_id}-${index}`}>
            <h3>{uiText("ai:scopedAiReview.exampleToComplete")}</h3><p>{uiText("ai:scopedAiReview.thisExampleIsNotAppliedToYour")}</p><p className={classes.example}>{example.template}</p>
            <ul>{example.questions.map((question, i) => <li key={i}>{question}</li>)}</ul>
            <button className={classes.button} onClick={async () => {
              try { await navigator.clipboard.writeText(example.template); setNotice(messageRef("ai:scopedAiReview.exampleCopied")); }
              catch { setNotice(messageRef("ai:scopedAiReview.couldNotCopySelectTheExampleText")); }
            }}>{uiText("ai:scopedAiReview.copyExample")}</button>
          </article>)}
        </> : null}
    {pending.length > 0 ? <button className={classes.primary} disabled={stale || !isAvailable} onClick={() => apply(pending)}>{uiText("ai:scopedAiReview.applyAll")}</button> : null}
  </section>;
}
