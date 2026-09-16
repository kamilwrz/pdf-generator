import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { t as uiText } from '../../i18n/index.js';
import { useTranslation } from 'react-i18next';
import classes from './InterviewDemo.module.css';

/**
 * Local, illustrative interview playback. No answers are collected or sent.
 * Play once on entering the viewport; manual selection stops playback. Reduced
 * motion retains every scene through the same native controls without timers.
 */
export default function InterviewDemo() {
  useTranslation();
  const root = useRef(null);
  const inView = useInView(root, { amount: 0.3 });
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const playing = inView && !paused && !reducedMotion && step < 2;
  const labels = [uiText('public:hero.demoQuestion'), uiText('public:hero.demoAnswer'), uiText('public:hero.demoResult')];

  useEffect(() => {
    if (!playing) return;
    // Reading intervals belong to the example, never to server progress. Stop
    // offscreen and clean up on selection/unmount so old timers cannot advance it.
    const timer = window.setTimeout(() => setStep((current) => Math.min(2, current + 1)), step === 0 ? 5000 : 8000);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  return (
    <figure ref={root} className={classes.demo} data-playing={playing}>
      <figcaption>{uiText('public:hero.interviewExampleLabel')}</figcaption>
      <p className={classes.disclaimer}>{uiText('public:hero.demoSimulation')}</p>
      <div className={classes.source}>
        <span className={classes.label}>{uiText('public:hero.exampleSourceLabel')}</span>
        <p>{uiText('public:hero.exampleSource')}</p>
      </div>
      <div className={classes.steps} role="group" aria-label={uiText('public:hero.demoSteps')}>
        {labels.map((label, index) => (
          <button key={label} type="button" aria-pressed={step === index}
            onClick={() => { setPaused(true); setStep(index); }}>
            <span aria-hidden="true">0{index + 1}</span>{label}
          </button>
        ))}
      </div>
      {/* Overlapping grid cells reserve the tallest scene without clipping long
          translations or zoomed text. Inactive scenes leave the accessibility tree. */}
      <div className={classes.stage}>
        <div className={classes.scene} data-active={step === 0} aria-hidden={step !== 0}>
          <span className={classes.label}>{uiText('public:hero.exampleQuestionLabel')}</span>
          <p className={classes.question}>{uiText('public:hero.exampleQuestion')}</p>
          <p className={classes.context}>{uiText('public:hero.demoQuestionHint')}</p>
          <div className={classes.inputHint}>{uiText('public:hero.demoAnswerPlaceholder')}<span aria-hidden="true">│</span></div>
        </div>
        <div className={classes.scene} data-active={step === 1} aria-hidden={step !== 1}>
          <span className={classes.label}>{uiText('public:hero.exampleAnswerLabel')}</span>
          <div className={classes.answer}>
            <span className={classes.accessibleText}>{uiText('public:hero.exampleAnswer')}</span>
            <p aria-hidden="true" className={classes.typed} key={`${step}-${reducedMotion}`}>
              {uiText('public:hero.exampleAnswer').split(' ').map((word, index) => (
                <span key={index} style={{ '--word-delay': `${index * 100}ms` }}>{word} </span>
              ))}
            </p>
          </div>
          <p className={classes.context}>{uiText('public:hero.demoAnswerHint')}</p>
        </div>
        <div className={classes.scene} data-active={step === 2} aria-hidden={step !== 2}>
          <span className={classes.label}>{uiText('public:hero.demoResultLabel')}</span>
          <div className={classes.result}><p>{uiText('public:hero.exampleResult')}</p></div>
          <p className={classes.context}>{uiText('public:hero.demoReviewHint')}</p>
        </div>
      </div>
      <div className={classes.footer}>
        <span className={classes.label}>{uiText('public:hero.demoStep', { current: step + 1 })}</span>
        {!reducedMotion && <button type="button" onClick={() => {
          if (step === 2) { setStep(0); setPaused(false); }
          else setPaused((value) => !value);
        }}>{step === 2 ? uiText('public:hero.demoReplay') : paused ? uiText('public:hero.demoPlay') : uiText('public:hero.demoPause')}</button>}
      </div>
      <p className={classes.note}>{uiText('public:hero.exampleNote')}</p>
    </figure>
  );
}
