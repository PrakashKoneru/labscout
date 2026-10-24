import type { Metadata } from "next";
import WiringCheck from "../components/WiringCheck";
import styles from "./debug.module.css";

export const metadata: Metadata = {
  title: "labscout wiring check",
  description: "Proof that the frontend, route handlers, and Postgres are connected.",
};

export default function DebugPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Wiring check</h1>
          <p>
            One button writes a row to Postgres and reads it back, the other sends a prompt to
            Claude. Both go through route handlers, so a green result means the whole path is
            connected.
          </p>
        </div>
        <WiringCheck />
      </main>
    </div>
  );
}
