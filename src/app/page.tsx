import WiringCheck from "./components/WiringCheck";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>labscout</h1>
          <p>
            An empty shell with the frontend, route handlers, and Lakebase Postgres on Neon already
            wired together. The buttons below exercise the whole path.
          </p>
        </div>
        <WiringCheck />
      </main>
    </div>
  );
}
