import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-recovery-shell">
      <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector home">
        <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">&trade;</sup>
      </Link>
      <section className="route-recovery-panel" aria-labelledby="not-found-title">
        <p className="eyebrow">NAVIGATION ERROR // SIGNAL LOST</p>
        <strong aria-hidden="true">404</strong>
        <h1 id="not-found-title">THIS SECTOR DOES NOT EXIST.</h1>
        <p>
          The address may have changed, or the transmission may be incomplete.
          Choose a known destination to resume navigation.
        </p>
        <div className="route-recovery-actions">
          <Link className="primary-action" href="/">RETURN HOME <span aria-hidden="true">&rarr;</span></Link>
          <Link className="secondary-action" href="/playtest">JOIN PLAYTEST</Link>
          <Link className="secondary-action" href="/download">DOWNLOADS</Link>
          <Link className="secondary-action" href="/community">COMMUNITY</Link>
        </div>
      </section>
    </main>
  );
}
