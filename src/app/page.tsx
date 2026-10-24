import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.wordmark}>labscout</h1>
          <p className={styles.tagline}>
            We help great companies exist, by finding the people who will start them before they know
            they are starting one.
          </p>
        </div>

        <div className={styles.doors}>
          <Link href="/investors" className={styles.door}>
            <span className={styles.doorLabel}>I invest</span>
            <span className={styles.doorTitle}>Find founders a year early</span>
            <span className={styles.doorBody}>
              Grant awards, commit velocity, and lab graphs, scored and watched for you.
            </span>
          </Link>
          <Link href="/students" className={`${styles.door} ${styles.doorAlt}`}>
            <span className={styles.doorLabel}>I build</span>
            <span className={styles.doorTitle}>Turn your work into a company</span>
            <span className={styles.doorBody}>
              A profile that builds itself, a co-founder match, and the grants you can win.
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
