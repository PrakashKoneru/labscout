import { useId } from 'react';

export default function BrandMark() {
  const id = useId().replace(/:/g, '');
  return (
    <svg width="43" height="47" viewBox="-4 -4 55 57" fill="none" aria-hidden="true">
      <defs>
        <filter id={`${id}-ink-bars`} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="3" seed="11" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.52" numOctaves="2" seed="4" result="streak" />
          <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -19 6.4" result="holes" />
          <feComposite in="rough" in2="holes" operator="out" />
        </filter>
      </defs>
      <g fill="currentColor" filter={`url(#${id}-ink-bars)`}>
        <path d="M1 33 9 32.5 9 45 1 45.5Z" />
        <path d="M13 24 21 23.5 21.2 45.2 13 45Z" />
        <path d="M25 12.5 33 13 33 45 25.2 45.5Z" />
        <path d="M37 1 45 1.5 45.2 45.3 37 45Z" />
      </g>
      <path d="M.5 49C15 48.5 29 49.8 46 49" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
