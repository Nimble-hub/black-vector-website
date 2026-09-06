"use client";
import Link from "next/link";

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel compact-auth-panel" role="alert">
        <p className="eyebrow">CONNECTION INTERRUPTED</p>
        <h1>Let&apos;s try that again.</h1>
        <p>This page couldn&apos;t finish loading. You can retry or return home.</p>
        <button type="button" className="primary-action" onClick={reset}>TRY AGAIN</button>
        <Link className="secondary-action" href="/">BACK TO HOME →</Link>
      </section>
    </main>
  );
}
