import Link from "next/link";
import styles from "./MarketingNav.module.css";

type Audience = "investors" | "students";

export default function MarketingNav({ active }: { active?: Audience }) {
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.wordmark}>
          labscout
        </Link>
        <nav className={styles.links}>
          <Link
            href="/investors"
            className={active === "investors" ? styles.linkActive : styles.link}
          >
            For investors
          </Link>
          <Link
            href="/students"
            className={active === "students" ? styles.linkActive : styles.link}
          >
            For students
          </Link>
        </nav>
      </div>
    </header>
  );
}
