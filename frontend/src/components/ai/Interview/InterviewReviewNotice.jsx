import { factLabel } from '../../../utils/interviewPresentation';
import classes from './Interview.module.css';

/** Explain filtered suggestions without exposing provider diagnostics or claims. */
export default function InterviewReviewNotice({ preview, legacy = false }) {
  const notes = preview?.review_notes || [];
  if (!legacy && !notes.length && !preview?.recovered_previous_attempt) return null;
  return <aside className={classes.reviewNotice} aria-label="Sprawdzenie propozycji AI">
    {legacy ? <><h3>Twoje odpowiedzi są zapisane</h3><p>Poprzednia propozycja wymagała korekty. Przygotuj CV ponownie — wykorzystamy zapisany wynik, jeśli jest dostępny, i zaproponujemy pytania o niejasne szczegóły.</p></> : <>
      <h3>CV jest gotowe do sprawdzenia</h3>
      {notes.length > 0 && <><p>Nie wszystkie szczegóły zostały potwierdzone. W tych miejscach CV zachowuje wcześniejszą treść albo pomija niepotwierdzony dodatek. Twoje zapisane odpowiedzi pozostają dostępne.</p>
        <details><summary>Co zachowaliśmy lub pominęliśmy ({notes.length})</summary><ul>{notes.map((note, index) => <li key={index}><strong>{factLabel({ path: note.path })}</strong> — {note.action === 'kept_original' ? 'zachowano potwierdzoną treść' : 'pominięto niepotwierdzony dodatek'}</li>)}</ul></details></>}
      {preview?.recovered_previous_attempt && <p>Ten podgląd wykorzystuje poprzedni wynik. Odzyskanie nie zużyło dodatkowych kredytów AI.</p>}
    </>}
  </aside>;
}
