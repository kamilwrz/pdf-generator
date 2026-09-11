import { useEffect, useRef, useState } from 'react';
import classes from './InterviewLoading.module.css';

const operations = {
  load: ['Otwieramy Twoją historię', 'Pobieramy wybrane informacje i zapisany etap rozmowy.', 'Odczyt danych konta'],
  start: ['Łączymy punkt wyjścia', 'Przygotowujemy wybrane źródło i informacje do sprawdzenia przed rozmową.', 'Przygotowanie rozmowy'],
  next: ['Szukamy właściwego pytania', 'AI dobiera pytanie do Twoich doświadczeń, dotychczasowych odpowiedzi i celu CV.', 'Dobór pytania przez AI'],
  answers: ['Zachowujemy Twoją odpowiedź', 'Zapisujemy odpowiedź, zanim przejdziesz do kolejnego pytania.', 'Zapis odpowiedzi'],
  confirm: ['Zapisujemy potwierdzone informacje', 'Zapisujemy informacje w wybranym źródle tej rozmowy.', 'Zapis potwierdzonych informacji'],
  preview: ['Twoja historia nabiera kształtu', 'Przygotowanie obejmuje napisanie treści, osobną redakcję języka i stylu, niezależną weryfikację faktów oraz ułożenie CV w szablonie.', 'Przygotowanie i kontrola CV'],
  document: ['Zapisujemy nową wersję CV', 'Tworzymy osobny dokument. Po zapisie otworzymy go w edytorze.', 'Zapis dokumentu'],
  source: ['Aktualizujemy punkt wyjścia', 'Wczytujemy aktualne CV. Zapisane odpowiedzi pozostają w rozmowie.', 'Odświeżenie źródła'],
  clarify: ['Wracamy do szczegółów', 'Otwieramy zapisane pytanie o informację wymagającą doprecyzowania.', 'Odczyt pytania'],
  'skip-clarifications': ['Przygotowujemy dalszy krok', 'Zachowujemy potwierdzone informacje i pobieramy aktualny stan rozmowy.', 'Aktualizacja rozmowy'],
  extend: ['Otwieramy kolejny rozdział', 'Dodajemy dobrowolną rundę do pięciu kolejnych pytań.', 'Rozszerzenie rozmowy'],
  sync: ['Aktualizujemy widok', 'Wynik operacji dotarł. Pobieramy aktualne informacje tej rozmowy.', 'Synchronizacja informacji'],
};

/** An indeterminate, operation-specific wait surface. Time never advances server stages. */
export default function InterviewLoading({ operation = 'load', facts, answers, language, template }) {
  const [seconds, setSeconds] = useState(0);
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const [title, description, current] = operations[operation] || operations.load;
  return <section className={classes.loading} aria-label="Przetwarzanie wywiadu">
    <div className={classes.manuscript} aria-hidden="true">
      <span className={classes.documentLabel}>CV / STUDIO</span>
      <div className={classes.paper}><i /><i /><i /><span /><i /><i /><i /><span /><i /><i /></div>
      <span className={classes.documentLabel}>INFORMACJE → TREŚĆ</span>
    </div>
    <div className={classes.body}>
      <p className={classes.eyebrow}>WYWIAD / W TOKU</p>
      <div role="status" aria-live="polite" aria-atomic="true"><h3 ref={heading} tabIndex={-1}>{title}</h3><p>{description}</p></div>
      <div className={classes.track} role="progressbar" aria-label={current}><span /></div>
      <div className={classes.current}><strong>{current}</strong><span aria-hidden="true">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div>
      <dl className={classes.context}>{answers != null && <div><dt>Zapisane odpowiedzi</dt><dd>{answers}</dd></div>}{facts != null && <div><dt>Potwierdzone informacje</dt><dd>{facts}</dd></div>}{language && <div><dt>Język CV</dt><dd>{language}</dd></div>}{template && <div><dt>Szablon</dt><dd>{template}</dd></div>}</dl>
      <p className={classes.note}>{seconds >= 30 ? 'Operacja nadal trwa. Czas zależy od ilości treści i odpowiedzi serwera. Nie uruchamiamy jej ponownie automatycznie.' : 'Wynik pokażemy po zakończeniu operacji. Twoje zapisane informacje pozostają na koncie.'}</p>
    </div>
  </section>;
}
