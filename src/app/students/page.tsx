import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "../components/MarketingNav";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "labscout for students",
  description:
    "Free for students and researchers. Your code, papers, and grants become a founder profile that builds itself.",
};

const benefits = [
  {
    title: "A profile that builds itself",
    body: "Connect GitHub and ORCID once. labscout reads what you have already published and keeps your profile current without you writing a single bullet point.",
  },
  {
    title: "Co-founder matching",
    body: "Matched on complementary skill, not on vibes. The person who can sell what you build is usually two buildings away and has no idea you exist.",
  },
  {
    title: "Grant radar",
    body: "Awards you qualify for, ranked by fit, with deadlines that actually reach you. Non-dilutive money is the cheapest funding you will ever raise.",
  },
  {
    title: "Investors come to you",
    body: "Funds searching labscout see your trajectory, not a resume. No cold email, no deck, no pretending you are further along than you are.",
  },
];

const steps = [
  {
    title: "Connect your accounts",
    body: "GitHub and ORCID take about thirty seconds. Everything after that is read-only and public anyway.",
  },
  {
    title: "We read the public record",
    body: "Commits, repos, papers, lab affiliation, and grant awards get pulled together into one continuously updated picture of what you are actually good at.",
  },
  {
    title: "Matches and signals stay live",
    body: "Co-founder suggestions, grant deadlines, and your readiness view refresh on their own. Come back when something changes, not to maintain a profile.",
  },
];

const ownership = [
  {
    title: "The profile is yours, and it is portable",
    body: "It is a credential backed by work you already did, which is far harder to fake than a resume and far easier to keep honest.",
  },
  {
    title: "You get found instead of pitching",
    body: "Discovery runs in the opposite direction here. The strongest position in any fundraise is not needing to start the conversation.",
  },
  {
    title: "Matching sharpens as the network grows",
    body: "Every student who joins makes everyone else's co-founder matches better. This is the one part of the product that you cannot build alone.",
  },
];

const profileSignals = [
  "Commit volume up 3.1x over two quarters, concentrated in evenings",
  "Named co-investigator on an active federal award",
  "Two preprints moved from theory toward applied benchmarks",
  "Three open-source repos with outside contributors",
];

const profilePills = ["systems", "ml-infra", "needs: go-to-market", "3 grant matches"];

export default function StudentsPage() {
  return (
    <div className={`${styles.shell} ${styles.violet}`}>
      <MarketingNav active="students" />

      <section className={styles.hero}>
        <div className={`${styles.inner} ${styles.heroBody}`}>
          <span className={styles.eyebrow}>Free for students</span>
          <h1 className={styles.headline}>
            Your commits are <em>already a company</em>.
          </h1>
          <p className={styles.sub}>
            You do not need an idea, a deck, or a co-founder to start. labscout turns the work you
            are already doing into a founder profile, finds you a co-founder, and tells you which
            grants you can win.
          </p>
          <div className={styles.ctaRow}>
            <a href="mailto:hello@labscout.dev" className={styles.button}>
              Claim your profile
            </a>
            <a href="#how" className={styles.buttonGhost}>
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>What you get</span>
            <h2 className={styles.sectionTitle}>
              Everything a first-time founder has to figure out alone.
            </h2>
            <p className={styles.sectionLede}>
              Free, permanently, for anyone enrolled or doing research. You are the reason the
              platform works, so you do not pay for it.
            </p>
          </div>
          <div className={styles.grid2}>
            {benefits.map((item) => (
              <article key={item.title} className={styles.card}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="how">
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>How it works</span>
            <h2 className={styles.sectionTitle}>Three steps, and only one of them is yours.</h2>
          </div>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.title} className={styles.step}>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>Your readiness view</span>
            <h2 className={styles.sectionTitle}>You are further along than you think.</h2>
            <p className={styles.sectionLede}>
              This is what a profile looks like after labscout reads the public record. Nothing here
              was typed in by hand.
            </p>
          </div>
          <div className={styles.profile}>
            <div className={styles.profileHead}>
              <div>
                <div className={styles.profileName}>Second-year PhD, distributed systems</div>
                <div className={styles.profileMeta}>Example profile</div>
              </div>
              <div className={styles.profileScore}>readiness 78</div>
            </div>
            <div className={styles.profileBody}>
              <ul className={styles.profileList}>
                {profileSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
              <div className={styles.pillRow}>
                {profilePills.map((pill) => (
                  <span key={pill} className={styles.pill}>
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className={styles.caption}>
            Illustrative profile with synthetic signals. You choose what is visible to investors.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>Why this is yours</span>
            <h2 className={styles.sectionTitle}>The leverage stays with you.</h2>
          </div>
          <ul className={styles.bullets}>
            {ownership.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                {item.body}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.inner}>
          <div className={styles.footerCard}>
            <h2 className={styles.footerTitle}>Start before you feel ready.</h2>
            <p className={styles.footerSub}>
              The first cohort is small on purpose. Bring a GitHub account and we will do the rest.
            </p>
            <div className={styles.footerCta}>
              <a href="mailto:hello@labscout.dev" className={styles.button}>
                Claim your profile
              </a>
              <Link href="/investors" className={styles.buttonGhost}>
                What investors see
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
