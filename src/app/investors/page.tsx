import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "../components/MarketingNav";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "labscout for investors",
  description:
    "Find technical founders a year before they incorporate, from research grants and code they are already publishing.",
};

const gaps = [
  {
    title: "Deal flow starts at incorporation",
    body: "By the time a company has a name, a deck, and a data room, the founder has already chosen who they talk to. You are competing on price, not on conviction.",
  },
  {
    title: "Warm intros are a lagging indicator",
    body: "An intro arrives because someone else already noticed. The signal you get is real but late, and it is the same signal four other funds got that week.",
  },
  {
    title: "Scrapers see profiles, not momentum",
    body: "A scraped bio tells you where someone worked. It cannot tell you that their commit volume tripled this quarter or that their grant renewal just cleared.",
  },
];

const signals = [
  {
    label: "github_velocity",
    what: "Commit cadence, repo creation, and the shape of the contribution graph across nights and weekends.",
    predicts: "Predicts a side project turning into a company 6 to 18 months out.",
  },
  {
    label: "grant_status",
    what: "Federal and institutional award records: new awards, renewals, phase transitions, and PI role changes.",
    predicts: "Predicts non-dilutive runway and validated technical depth.",
  },
  {
    label: "lab_graph",
    what: "Lab affiliation, advisor, and co-author network reconstructed from the public research record.",
    predicts: "Predicts co-founder pairs and who the credible first five hires are.",
  },
  {
    label: "publication_drift",
    what: "Movement from pure research output toward applied, systems, and benchmark work.",
    predicts: "Predicts a researcher who has started caring whether the thing ships.",
  },
];

const moat = [
  {
    title: "Shared activity, not scraped profiles",
    body: "Founders are on labscout because it helps them: profile, co-founder matching, grant radar. Their activity is intent data generated in a product, which is a category of signal no crawler can reach.",
  },
  {
    title: "Two-sided by construction",
    body: "Most sourcing tools have to buy their supply side. Ours shows up for its own reasons and stays because the product is useful before anyone is a founder.",
  },
  {
    title: "History compounds",
    body: "A snapshot of a founder is a commodity. Twelve months of their trajectory is not. Every week the platform runs, the back catalogue gets harder to replicate.",
  },
];

const product = [
  {
    title: "Scored founder feed",
    body: "A ranked, filterable view of people whose signals are accelerating, scoped to your thesis, stage, and geography.",
  },
  {
    title: "Inflection alerts",
    body: "Get told the week something changes: a grant lands, a repo goes public, a PhD candidate quietly stops publishing.",
  },
  {
    title: "Watchlists",
    body: "Track a person for two years without touching them. The timeline fills itself in so your first conversation is not a cold one.",
  },
  {
    title: "Warm path lookup",
    body: "See how your network reaches a researcher through advisors, co-authors, and former labmates.",
  },
];

export default function InvestorsPage() {
  return (
    <div className={styles.shell}>
      <MarketingNav active="investors" />

      <section className={styles.hero}>
        <div className={`${styles.inner} ${styles.heroBody}`}>
          <span className={styles.eyebrow}>For investors</span>
          <h1 className={styles.headline}>
            The best founders <em>don&apos;t have a company yet</em>.
          </h1>
          <p className={styles.sub}>
            labscout watches the public record that technical people generate before they ever
            incorporate, so you can meet them a year before the first warm intro lands in your
            inbox.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/students" className={styles.button}>
              See the other side
            </Link>
            <a href="#moat" className={styles.buttonGhost}>
              Why it can&apos;t be copied
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>The gap</span>
            <h2 className={styles.sectionTitle}>Everyone sources at the same moment.</h2>
            <p className={styles.sectionLede}>
              Sourcing today begins the instant a company becomes legible, which is precisely when
              it stops being cheap.
            </p>
          </div>
          <div className={styles.grid3}>
            {gaps.map((item) => (
              <article key={item.title} className={styles.card}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>The signals</span>
            <h2 className={styles.sectionTitle}>
              What someone builds on a Tuesday night is a forecast.
            </h2>
            <p className={styles.sectionLede}>
              Four signal families, collected automatically and refreshed continuously. No founder
              has to fill out a form for any of this to work.
            </p>
          </div>
          <div className={styles.signals}>
            {signals.map((signal) => (
              <div key={signal.label} className={styles.signalRow}>
                <div className={styles.signalLabel}>{signal.label}</div>
                <div>
                  <p className={styles.signalWhat}>{signal.what}</p>
                  <p className={styles.signalPredicts}>{signal.predicts}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="moat">
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>The moat</span>
            <h2 className={styles.sectionTitle}>
              This data set cannot be bought, and it gets worse to compete with every month.
            </h2>
          </div>
          <div className={styles.grid3}>
            {moat.map((item, index) => (
              <article key={item.title} className={styles.card}>
                <span className={styles.cardNum}>0{index + 1}</span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>What you get</span>
            <h2 className={styles.sectionTitle}>A standing view of people, not a list of rounds.</h2>
          </div>
          <div className={styles.grid2}>
            {product.map((item) => (
              <article key={item.title} className={styles.card}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.inner}>
          <div className={styles.footerCard}>
            <h2 className={styles.footerTitle}>Meet them before the round exists.</h2>
            <p className={styles.footerSub}>
              We are onboarding a small number of funds alongside the first cohort of student
              builders.
            </p>
            <div className={styles.footerCta}>
              <a href="mailto:hello@labscout.dev" className={styles.button}>
                Request access
              </a>
              <Link href="/students" className={styles.buttonGhost}>
                What students see
              </Link>
            </div>
          </div>
          <div className={styles.colophon}>
            <span>labscout — helping great companies exist.</span>
            <span>Built for the October 24 hackathon.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
