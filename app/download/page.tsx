import type { Metadata } from "next";
import Link from "next/link";
import { DownloadAccessCard } from "../download-access-card";
import { StandaloneHeader } from "@/app/standalone-header";

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
    copy: "Create a Black Vector account or connect an existing identity to apply for private testing.",
  },
  {
    index: "02",
    title: "Verify your email",
    copy: "Verify your email to receive playtest invitations, release notices, and account support.",
  },
  {
    index: "03",
    title: "Receive access",
    copy: "Approved playtesters can download an active release directly from this page.",
  },
] as const;

export default function DownloadPage() {
  return (
    <main className="download-shell" id="top">
      <StandaloneHeader basePath={BASE_PATH} current="download" variant="download" />

      <section className="download-page-hero" id="main-content" tabIndex={-1} aria-labelledby="download-page-title">
        <div className="download-page-copy">
          <p className="eyebrow">PRIVATE PLAYTEST // WINDOWS</p>
          <h1 id="download-page-title">BLACK VECTOR PLAYTEST BUILDS.</h1>
          <p>
            Approved playtesters can download current Black Vector builds here.
            Sign in with a verified account to view release availability and
            access status.
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
          <div>
            <p className="eyebrow">ACCESS SEQUENCE</p>
            <h2 id="clearance-title">GET READY FOR DEPLOYMENT.</h2>
          </div>
          <p>
            One verified account carries your application, access status, and
            available Black Vector releases.
          </p>
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
          Build access is limited to verified accounts approved for an active
          private playtest release.
        </p>
      </section>

      <footer className="download-footer">
        <p>&copy; 2026 Nimble Game Studios. All rights reserved.</p>
        <div>
          <a href="#top">BACK TO TOP</a>
          <Link href={`${BASE_PATH}/support`}>SUPPORT DEVELOPMENT</Link>
          <Link href={`${BASE_PATH}/terms`}>TERMS OF SERVICE</Link>
          <Link href={`${BASE_PATH}/privacy`}>PRIVACY NOTICE</Link>
          <Link href={`${BASE_PATH}/legal`}>LEGAL NOTICES</Link>
        </div>
      </footer>
    </main>
  );
}
