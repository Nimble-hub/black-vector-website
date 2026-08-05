import type { Metadata } from "next";
import Link from "next/link";
import { DownloadAccessCard } from "../download-access-card";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Download Black Vector",
  description:
    "Secure Black Vector build delivery for approved playtest accounts.",
};

export const dynamic = "force-dynamic";

const clearanceSteps = [
  {
    index: "01",
    title: "Create an account",
    copy: "Connect an identity or create a Black Vector account to enter the playtest candidate pool.",
  },
  {
    index: "02",
    title: "Verify your email",
    copy: "A verified contact channel is required for access windows, build notices, and account recovery.",
  },
  {
    index: "03",
    title: "Receive clearance",
    copy: "Private builds unlock here when your account is approved and an active playtest release is deployed.",
  },
] as const;

export default function DownloadPage() {
  return (
    <main className="download-shell">
      <header className="download-header">
        <Link className="auth-wordmark download-wordmark" href={`${BASE_PATH}/`} aria-label="Return to Black Vector home">
          <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">™</sup>
        </Link>
        <nav aria-label="Download page navigation">
          <Link href={`${BASE_PATH}/`}>HOME</Link>
          <Link href={`${BASE_PATH}/playtest`}>JOIN PLAYTEST</Link>
          <Link href={`${BASE_PATH}/account`}>ACCOUNT</Link>
          <Link href={`${BASE_PATH}/community`}>COMMUNITY</Link>
        </nav>
      </header>

      <section className="download-page-hero" aria-labelledby="download-page-title">
        <div className="download-page-copy">
          <p className="eyebrow">SECURE DISTRIBUTION // PRIVATE PLAYTEST</p>
          <h1 id="download-page-title">BLACK VECTOR BUILD TERMINAL.</h1>
          <p>
            This is the official delivery point for playable Black Vector
            builds. The terminal below checks release availability and your
            account clearance automatically.
          </p>
          <div className="download-page-actions">
            <Link className="primary-action" href={`${BASE_PATH}/playtest`}>
              JOIN THE PLAYTEST <span aria-hidden="true">→</span>
            </Link>
            <Link className="secondary-action" href={`${BASE_PATH}/account`}>
              OPEN ACCOUNT <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="download-terminal-wrap">
          <div className="download-terminal-frame" aria-hidden="true">
            <span>BV-DISTRIBUTION-01</span>
            <small>ENCRYPTED DELIVERY CHANNEL</small>
          </div>
          <DownloadAccessCard basePath={BASE_PATH} variant="terminal" />
        </div>
      </section>

      <section className="download-clearance" aria-labelledby="clearance-title">
        <div className="download-clearance-heading">
          <p className="eyebrow">ACCESS SEQUENCE</p>
          <h2 id="clearance-title">FROM REGISTRATION TO DEPLOYMENT.</h2>
        </div>
        <div className="download-clearance-grid">
          {clearanceSteps.map((step) => (
            <article key={step.index}>
              <span>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
        <p className="download-security-note">
          Builds remain unavailable unless a current release exists and your
          signed-in account has explicit access. When online, the disabled
          status control above becomes the authenticated game download button.
        </p>
      </section>
    </main>
  );
}
