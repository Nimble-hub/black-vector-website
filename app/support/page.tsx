import type { Metadata } from "next";
import Link from "next/link";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/PAasrdjBqe";

export const metadata: Metadata = {
  title: "Support Black Vector Development",
  description:
    "Preview the upcoming Black Vector development-support program and follow its progress before contributions open.",
};

const programPrinciples = [
  {
    index: "01",
    title: "Transparent tiers",
    copy: "Every contribution level will publish its price, included rewards, and delivery expectations before support opens.",
    note: "PRICING IN REVIEW",
  },
  {
    index: "02",
    title: "Defined rewards",
    copy: "Supporter recognition and digital rewards are under review. Final benefits will be specific to each published tier.",
    note: "REWARDS IN REVIEW",
  },
  {
    index: "03",
    title: "Future game access",
    copy: "Selected tiers may include a future copy of Black Vector only where that benefit is explicitly stated in the final offer.",
    note: "TERMS NOT YET PUBLISHED",
  },
] as const;

const launchChecks = [
  "Finalize contribution amounts and supporter rewards",
  "Publish fulfillment, eligibility, and refund terms",
  "Complete secure checkout testing before accepting funds",
] as const;

export default function SupportPage() {
  return (
    <main className="support-shell">
      <header className="support-header">
        <Link
          className="auth-wordmark support-wordmark"
          href={`${BASE_PATH}/`}
          aria-label="Return to Black Vector home"
        >
          <span>BV</span> BLACK VECTOR
          <sup className="trademark-symbol">&trade;</sup>
        </Link>
        <nav aria-label="Support page navigation">
          <Link href={`${BASE_PATH}/`}>HOME</Link>
          <Link href={`${BASE_PATH}/playtest`}>PLAYTEST</Link>
          <Link href={`${BASE_PATH}/download`}>DOWNLOAD</Link>
          <Link href={`${BASE_PATH}/community`}>COMMUNITY</Link>
          <Link href={`${BASE_PATH}/account`}>ACCOUNT</Link>
        </nav>
      </header>

      <section className="support-hero" aria-labelledby="support-title">
        <div className="support-hero-copy">
          <p className="eyebrow">INDEPENDENT DEVELOPMENT // COMING SOON</p>
          <h1 id="support-title">HELP BUILD BLACK VECTOR.</h1>
          <p>
            Black Vector is in prototype development. An optional supporter
            program is being prepared for players who want to fund production
            through clearly defined contribution tiers and rewards.
          </p>
          <div className="support-hero-actions">
            <span className="primary-action support-disabled-action" aria-disabled="true">
              SUPPORT PROGRAM // NOT YET OPEN
            </span>
            <Link className="secondary-action" href={`${BASE_PATH}/playtest`}>
              JOIN THE PLAYTEST <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <p className="support-availability">
            Support is not yet open. Pricing, rewards, and launch timing will be
            published here when finalized.
          </p>
        </div>

        <aside className="support-status" aria-label="Support program status">
          <div className="support-status-heading">
            <span>PROGRAM STATUS</span>
            <strong>PRE-LAUNCH</strong>
          </div>
          <dl>
            <div>
              <dt>PROJECT PHASE</dt>
              <dd>PROTOTYPE</dd>
            </div>
            <div>
              <dt>CONTRIBUTIONS</dt>
              <dd>NOT ACCEPTED</dd>
            </div>
            <div>
              <dt>SUPPORT TIERS</dt>
              <dd>IN REVIEW</dd>
            </div>
            <div>
              <dt>RETAIL SALES</dt>
              <dd>HIDDEN UNTIL LATER DEVELOPMENT</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="support-tiers" aria-labelledby="support-tiers-title">
        <div className="support-section-heading">
          <div>
            <p className="eyebrow">PROGRAM PREVIEW // NO PRICES SET</p>
            <h2 id="support-tiers-title">A SUPPORT PROGRAM BUILT ON CLARITY.</h2>
          </div>
          <p>
            Final contribution tiers are still in development. These principles
            will guide every published offer.
          </p>
        </div>
        <div className="support-tier-grid">
          {programPrinciples.map((tier) => (
            <article key={tier.index}>
              <div className="support-tier-meta">
                <span>{tier.index}</span>
                <small>{tier.note}</small>
              </div>
              <h3>{tier.title}</h3>
              <p>{tier.copy}</p>
              <strong>DETAILS PENDING</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="support-readiness" aria-labelledby="support-readiness-title">
        <div>
          <p className="eyebrow">BEFORE CHECKOUT OPENS</p>
          <h2 id="support-readiness-title">CLEAR TERMS. SECURE PAYMENT. NO SURPRISES.</h2>
        </div>
        <ol>
          {launchChecks.map((check, index) => (
            <li key={check}>
              <span>0{index + 1}</span>
              <p>{check}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="support-disclosure" aria-labelledby="support-disclosure-title">
        <div>
          <p className="eyebrow">SUPPORTER NOTICE</p>
          <h2 id="support-disclosure-title">DEVELOPMENT SUPPORT, NOT A RETAIL SALE.</h2>
        </div>
        <div className="support-disclosure-copy">
          <p>
            The future program will offer voluntary paid support tiers from a
            for-profit game studio. Contributions will not be charitable or
            tax-deductible, and they will not provide ownership, equity,
            investment rights, or benefits beyond those expressly listed for
            the selected tier.
          </p>
          <p>
            A future Black Vector game copy will be included only where the
            final published tier explicitly says so. Standard game purchases
            will remain separate and will appear later, when the project reaches
            an appropriate alpha or beta stage.
          </p>
        </div>
      </section>

      <footer className="support-footer">
        <p>
          Want to follow the discussion while the program is prepared?
        </p>
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
          JOIN THE NIMBLE GAME STUDIOS DISCORD <span aria-hidden="true">&nearr;</span>
        </a>
      </footer>
    </main>
  );
}
