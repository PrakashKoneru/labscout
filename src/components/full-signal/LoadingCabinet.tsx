import styles from "./LoadingCabinet.module.css";

/** A real GIF, with a static source selected before loading when motion is reduced. */
export default function LoadingCabinet() {
  return (
    <div className={styles.cabinet}>
      <picture>
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet="/loading-cabinet-seamless.png"
          type="image/png"
        />
        {/* An unoptimized image preserves the GIF's successive folder animation. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/loading-cabinet-seamless.gif"
          width={600}
          height={500}
          alt="Illustrated Full Signal filing cabinet, riffling through research, patents, grants, and people."
          className={styles.image}
          decoding="async"
          fetchPriority="high"
        />
      </picture>
    </div>
  );
}
