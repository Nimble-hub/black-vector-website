import type { Metadata } from "next";
import Link from "next/link";
import { StandaloneHeader } from "@/app/standalone-header";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/PAasrdjBqe";

export const metadata: Metadata = {
  title: "Support Black Vector Development",
  description:
    "Preview the upcoming Black Vector development-support program and follow its progress before contributions open.",
};

const developmentPriorities = [
  {
    index: "01",
    title: "Fleet-command systems",
    copy: "Expand the combat sandbox, strategic economy, fleet behaviors, and the scale of battles players can command.",
    note: "CORE GAMEPLAY",
  },
  {
    index: "02",
    title: "World and presentation",
    copy: "Advance ship art, sound, cinematic presentation, interface quality, and the larger Black Vector universe.",
    note: "ART // AUDIO // CINEMATICS",
  },
  {
    index: "03",
    title: "Playtest infrastructure",
    copy: "Support reliable build delivery, community tools, testing operations, and faster iteration from player feedback.",
    note: "BUILDS // COMMUNITY",
  },
] as const;

const supportTierPrices = [30, 50, 75, 100, 150, 200] as const;

export default function SupportPage() {
  return (
    <main className="support-shell" id="top">
      <StandaloneHeader basePath={BASE_PATH} current="support" variant="support" />

      <section className="support-hero" id="main-content" tabIndex={-1} aria-labelledby="support-title">
        <div className="support-hero-copy">
          <p className="eyebrow">INDEPENDENT DEVELOPMENT // COMING SOON</p>
          <h1 id="support-title">HELP BUILD BLACK VECTOR.</h1>
          <p>
            Black Vector is in prototype development. An optional supporter
            program is being prepared for players who want to fund production
            through clearly defined contribution tiers and rewards.
          </p>
          <div className="support-hero-actions">
            <Link className="primary-action" href={`${BASE_PATH}/playtest`}>
              JOIN THE PLAYTEST <span aria-hidden="true">&rarr;</span>
            </Link>
            <span className="support-program-state" role="status">
              <i aria-hidden="true" /> SUPPORT OPENS LATER
            </span>
          </div>
          <p className="support-availability">
            Support is not yet open. Six tiers from $30 to $200 are planned.
            Rewards and launch timing will be published here when finalized.
          </p>
        </div>

        <aside className="support-status" aria-label="Support program status">
          <div className="support-status-heading">
            <span>PROGRAM STATUS</span>
            <strong>PRE-LAUNCH</strong>
          </div>
          <dl>
            <div>
              <dt>SUPPORT RANGE</dt>
              <dd>$30 &mdash; $200</dd>
            </div>
            <div>
              <dt>PLANNED TIERS</dt>
              <dd>6 LEVELS</dd>
            </div>
            <div>
              <dt>REWARDS</dt>
              <dd>TO BE ANNOUNCED</dd>
            </div>
            <div>
              <dt>PAYMENTS</dt>
              <dd>NOT YET OPEN</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="support-tiers" aria-labelledby="support-tiers-title">
        <div className="support-section-heading">
          <div>
            <p className="eyebrow">SUPPORT LEVELS // COMING SOON</p>
            <h2 id="support-tiers-title">SIX WAYS TO BACK DEVELOPMENT.</h2>
          </div>
          <p>
            Every tier will receive a defined reward package before support
            opens. Full details will be published before contributions begin.
          </p>
        </div>
        <div className="support-price-grid">
          {supportTierPrices.map((price, index) => (
            <article key={price}>
              <div className="support-price-meta">
                <span>TIER {String(index + 1).padStart(2, "0")}</span>
                <small>COMING SOON</small>
              </div>
              <h3><sup>$</sup>{price}</h3>
              <p>Full reward details will be published before this tier opens.</p>
              <strong>DETAILS // COMING SOON</strong>
            </article>
          ))}
        </div>
        <div className="support-tier-disclaimer" role="note">
          <strong>PRELIMINARY PROGRAM NOTICE</strong>
          <p>
            Planned prices, tier structure, and rewards are subject to change
            and will be finalized when support opens. Final reward descriptions,
            eligibility, estimated fulfillment timing, taxes, and refund terms
            will be shown before any payment is accepted. Displayed tiers do not
            create a reservation, purchase, or entitlement.
          </p>
          <div className="support-policy-actions" aria-label="Support program terms">
            <Link href={`${BASE_PATH}/terms#support`}>
              TERMS OF SERVICE <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link href={`${BASE_PATH}/legal#support-program`}>
              SUPPORTER NOTICE <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="support-priority-intro">
          <p className="eyebrow">WHAT SUPPORT ADVANCES</p>
          <p>
            Contributions will be directed toward the game, presentation, and
            services that move Black Vector from prototype to playtest-ready.
          </p>
        </div>
        <div className="support-priority-grid">
          {developmentPriorities.map((priority) => (
            <article key={priority.index}>
              <div className="support-tier-meta">
                <span>{priority.index}</span>
                <small>{priority.note}</small>
              </div>
              <h3>{priority.title}</h3>
              <p>{priority.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-disclosure" aria-labelledby="support-disclosure-title">
        <div>
          <p className="eyebrow">SUPPORTER NOTICE</p>
          <h2 id="support-disclosure-title">SUPPORT WITH CLEAR EXPECTATIONS.</h2>
        </div>
        <div className="support-disclosure-copy">
          <p>
            The future program will offer voluntary paid support tiers from a
            for-profit game studio. Support payments will not be charitable or
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
          <Link className="support-legal-link" href={`${BASE_PATH}/legal#support-program`}>
            READ THE FULL SUPPORTER NOTICE <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      <footer className="support-footer">
        <p>
          Want to follow the discussion while the program is prepared?
        </p>
        <div>
          <a href="#top">BACK TO TOP</a>
          <Link href={`${BASE_PATH}/terms`}>TERMS OF SERVICE</Link>
          <Link href={`${BASE_PATH}/privacy`}>PRIVACY NOTICE</Link>
          <Link href={`${BASE_PATH}/legal`}>LEGAL NOTICES</Link>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
            JOIN THE NGS DISCORD <span aria-hidden="true">{"\u2197"}</span>
          </a>
        </div>
      </footer>
    </main>
  );
}
