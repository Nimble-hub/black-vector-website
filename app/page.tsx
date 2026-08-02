import type { Metadata } from "next";
import { HyperspaceIntro } from "./hyperspace-intro";

export const metadata: Metadata = {
  title: "Black Vector | Cinematic Fleet-Command RTS",
  description:
    "Black Vector is a cinematic fleet-command RTS set in a fractured human future.",
};

export default function Home() {
  return (
    <main>
      <HyperspaceIntro />

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-scan" aria-hidden="true" />

        <header className="site-header">
          <a className="wordmark" href="#top" aria-label="Black Vector home">
            <span className="wordmark-mark" aria-hidden="true">BV</span>
            <span>BLACK VECTOR</span>
          </a>
          <div className="signal-state">
            <span aria-hidden="true" />
            V.A.L.O.R. UPLINK // ACTIVE
          </div>
        </header>

        <div className="hero-content" id="top">
          <p className="eyebrow">THE 27-DAY SKIRMISH // AFTER-ACTION ARCHIVE</p>
          <h1 id="hero-title">
            THE MACHINES LEFT.
            <span>THE WAR BEGAN.</span>
          </h1>
          <p className="hero-copy">
            Command surviving fleets at the edge of known space, where every
            signal carries a threat—and every victory changes what remains human.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#archive">
              ENTER THE ARCHIVE <span aria-hidden="true">↘</span>
            </a>
            <button className="text-action" type="button" data-replay-jump>
              REPLAY JUMP
            </button>
          </div>
        </div>

        <div className="hero-meta" aria-label="Visual development image details">
          <span>CONCEPT ART // VISUAL DEVELOPMENT</span>
          <span>HUMAN CARRIER / DISCORD REF. 1533253150839148836</span>
        </div>

        <a className="scroll-cue" href="#archive">
          <span>SCROLL TO DECRYPT</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section className="archive" id="archive" aria-labelledby="archive-title">
        <p className="eyebrow">ARCHIVE NODE 01 // STRATEGIC OVERVIEW</p>
        <h2 id="archive-title">A WAR FOUGHT IN THE DARK BETWEEN SIGNALS.</h2>
        <p>
          This first build establishes the cinematic entry. The wider campaign,
          faction, ship, and lore archive will unfold from here.
        </p>
      </section>
    </main>
  );
}
