import styles from './ArchiveIllustration.module.css';

export default function ArchiveIllustration() {
  return (
    <figure className={styles.figure}>
      <img
        src="/archive-cabinet-open.png"
        width={1122}
        height={1402}
        alt="A flat black-and-white filing cabinet with a selected black research tab and a candidate profile pulled forward."
        className={styles.art}
        fetchPriority="high"
        decoding="async"
      />
    </figure>
  );
}
