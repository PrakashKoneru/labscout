import { useId } from 'react';
import type { CSSProperties } from 'react';
import styles from './InkTitle.module.css';

const LETTERS = ['a', 'l', 'l', ' ', 's', 'i', 'g', 'n', 'a', 'l'];
const POSITIONS = [0, 71, 107, 143, 181, 247, 281, 354, 428, 502];

export default function InkTitle() {
  const id = useId().replace(/:/g, '');
  return (
    <h1 className={styles.title} id="landing-title" aria-label="all signal">
      <svg viewBox="-10 -18 570 174" aria-hidden="true" className={styles.art}>
        <defs>
          <filter id={`${id}-ink`} x="-8%" y="-12%" width="116%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" result="edge" />
            <feDisplacementMap in="SourceGraphic" in2="edge" scale="3" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.32" numOctaves="2" seed="4" result="streak" />
            <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -16 5.6" result="streakA" />
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="9" result="speck" />
            <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -24 7.0" result="speckA" />
            <feComposite in="streakA" in2="speckA" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="holes" />
            <feComposite in="rough" in2="holes" operator="out" />
          </filter>
        </defs>
        {LETTERS.map((letter, index) => letter !== ' ' && (
          <g key={index} className={styles.letter} style={{ '--delay': `${index * 70}ms` } as CSSProperties}>
            <text x={POSITIONS[index]} y="112" fontSize="127" fontWeight="900" filter={`url(#${id}-ink)`}>{letter}</text>
          </g>
        ))}
        <path d="M0 133C105 130 203 137 310 133S461 132 542 134" className={styles.ground} />
      </svg>
    </h1>
  );
}
