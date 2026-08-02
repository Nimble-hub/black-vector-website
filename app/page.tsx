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

        <div className="world-label world-label-planet" data-world-anchor="planet" aria-hidden="true">
          <span>CELESTIAL CONTACT // PRIMARY</span>
          <strong>UNREGISTERED STORMWORLD</strong>
          <small>ORBITAL SOLUTION LOCKED</small>
        </div>

        <div className="world-label world-label-flagship" data-world-anchor="flagship" aria-hidden="true">
          <span>FLEET CONTACT // 01</span>
          <strong>CARRIER GROUP</strong>
          <small>FORMATION HOLDING</small>
        </div>

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

        <div className="hero-meta" aria-label="Live theater details">
          <span>LIVE THEATER // PROCEDURAL 3D</span>
          <span>FLEET CAMERA / SECTOR BV-01</span>
        </div>

        <a className="scroll-cue" href="#archive">
          <span>SCROLL TO DECRYPT</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section className="archive" id="archive" aria-labelledby="archive-title">
        <p className="eyebrow">ARCHIVE NODE 01 // STRATEGIC OVERVIEW</p>
        <h2 id="archive-title">COMMAND THE FRACTURE.</h2>
        <p>
          Black Vector is a fleet-command RTS about distance, incomplete
          intelligence, and decisions that continue moving after you make them.
        </p>
        <div className="node-index" aria-label="Archive status">
          <span>01 / FLEET COMMAND</span>
          <span>02 / SIGNAL WARFARE</span>
          <span>03 / THE 27-DAY SKIRMISH</span>
        </div>
      </section>

      <section className="archive archive-secondary" aria-labelledby="signal-title">
        <p className="eyebrow">ARCHIVE NODE 02 // SIGNAL WARFARE</p>
        <h2 id="signal-title">NOTHING ARRIVES IN REAL TIME.</h2>
        <p>
          Read the battlespace through delayed transmissions, commit your fleet,
          and live with the uncertainty between the order and its consequence.
        </p>
      </section>
    </main>
  );
}
