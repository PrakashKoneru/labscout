"use client";

import { useEffect, useState } from 'react';
import LoadingCabinet from './LoadingCabinet';
import styles from './Processing.module.css';

type ProcessingProps = {
  query: string;
  files: string[];
  onComplete: () => void;
  onCancel: () => void;
};

const SEQUENCE_DURATION_MS = 10500;
const CHECK_INTERVAL_MS = 1450;
const CHECKS = [
  'Checking socials…',
  'Checking research…',
  'Following the paper trail…',
  'Connecting the dots…',
  'Combobulating…',
  'Separating signal from noise…',
  'Filing the good stuff…',
] as const;

export default function Processing({ onComplete, onCancel }: ProcessingProps) {
  const [checkIndex, setCheckIndex] = useState(0);

  useEffect(() => {
    const rotation = window.setInterval(() => {
      setCheckIndex((index) => (index + 1) % CHECKS.length);
    }, CHECK_INTERVAL_MS);
    const completion = window.setTimeout(onComplete, SEQUENCE_DURATION_MS);
    return () => {
      window.clearInterval(rotation);
      window.clearTimeout(completion);
    };
  }, [onComplete]);

  return (
    <section className={styles.processing} aria-labelledby="processing-heading">
      <div className={styles.topline}>
        <button className={styles.back} type="button" onClick={onCancel}>
          <span aria-hidden="true">←</span> Back to research desk
        </button>
        <span className={styles.fileIndex}>AS / RESEARCH DESK / 002</span>
      </div>
      <div className={styles.stage}>
        <div className={styles.status}>
          <p className={styles.eyebrow}>GOOD THINGS ARE CONNECTING</p>
          <h1 id="processing-heading" className={styles.heading}>
            <span key={checkIndex} className={styles.rotatingCheck}>
              <span className={styles.checkIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {CHECKS[checkIndex]}
            </span>
          </h1>
          <div className={styles.sequence} aria-hidden="true">
            {CHECKS.map((check, index) => <span key={check} className={index === checkIndex ? styles.active : ''} />)}
          </div>
        </div>
        <figure className={styles.animation} aria-label="Sorting the research archive">
          <LoadingCabinet />
        </figure>
        <button className={styles.skip} type="button" onClick={onComplete}>
          Open cabinet <span aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );
}
