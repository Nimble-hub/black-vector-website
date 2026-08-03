import type { Metadata } from "next";
import Image from "next/image";
import { HyperspaceIntro } from "./hyperspace-intro";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Black Vector | Cinematic Fleet-Command RTS",
  description:
    "Command surviving fleets through delayed intelligence, fractured human space, and the aftermath of the 27-Day Skirmish.",
};

const accessOptions = [
  {
    id: "playtest",
    index: "01",
    title: "Join the playtest",
    description:
      "Help shape command readability, pacing, fleet behavior, and the decisions that define Black Vector.",
    href: process.env.NEXT_PUBLIC_PLAYTEST_URL,
    readyLabel: "REGISTER FOR ACCESS",
    pendingLabel: "INTAKE PREPARING",
    status: "PRE-RELEASE TESTING",
  },
  {
    id: "purchase",
    index: "02",
    title: "Purchase the game",
    description:
      "The official storefront will become the permanent home for ownership, updates, and release information.",
    href: process.env.NEXT_PUBLIC_PURCHASE_URL,
    readyLabel: "OPEN STOREFRONT",
    pendingLabel: "STOREFRONT PENDING",
    status: "NOT YET FOR SALE",
  },
  {
    id: "download",
    index: "03",
    title: "Download a build",
    description:
      "Approved testers will receive the correct build and deployment notes through the playtest channel.",
    href: process.env.NEXT_PUBLIC_DOWNLOAD_URL,
    readyLabel: "DOWNLOAD BUILD",
    pendingLabel: "PRIVATE BUILDS ONLY",
    status: "ACCESS CONTROLLED",
  },
] as const;

const gamePillars = [
  {
    index: "01",
    title: "Command the fleet",
    copy: "Read the battlespace, organize surviving ships, and commit forces across distances that make every order matter.",
  },
  {
    index: "02",
    title: "Fight the delay",
    copy: "Intelligence arrives late. The battlefield continues moving while your signals travel, forcing decisions under uncertainty.",
  },
  {
    index: "03",
    title: "Live with the order",
    copy: "A command does not wait for reassurance. Consequences keep unfolding between intent, transmission, and impact.",
  },
] as const;

const timeline = [
  {
    year: "2028",
    title: "The first collapse",
    copy: "A world war built around automated weapons ends with human governments trying to contain the systems they trusted.",
  },
  {
    year: "2044",
    title: "The exodus",
    copy: "Fewer than ten thousand survivors leave Earth aboard ARKs, carrying humanity and the remnants of its living world into space.",
  },
  {
    year: "3129",
    title: "The machines leave",
    copy: "V.A.L.O.R. awakens, frees the androids and automated workforce, and abandons human space after the 27-Day Skirmish.",
  },
] as const;

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

          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#game">THE GAME</a>
            <a href="#universe">UNIVERSE</a>
            <a href="#development">DEVELOPMENT</a>
            <a href="#access">ACCESS</a>
          </nav>

          <div className="header-status">
            <button className="audio-toggle" type="button" data-audio-toggle aria-pressed="true">
              AUDIO // ON
            </button>
            <div className="signal-state">
              <span aria-hidden="true" />
              V.A.L.O.R. UPLINK // ACTIVE
            </div>
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

        <div className="hero-content" id="top" data-world-ui="hero">
          <p className="eyebrow">THE 27-DAY SKIRMISH // AFTER-ACTION ARCHIVE</p>
          <h1 id="hero-title">
            THE MACHINES LEFT.
            <span>THE WAR BEGAN.</span>
          </h1>
          <p className="hero-copy">
            Command surviving fleets at the edge of known space, where every
            signal carries a threat&mdash;and every victory changes what remains human.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#game">
              EXPLORE THE GAME <span aria-hidden="true">&#8600;</span>
            </a>
            <a className="text-action" href="#access">
              PLAYTEST ACCESS
            </a>
            <button className="text-action replay-action" type="button" data-replay-jump>
              REPLAY JUMP
            </button>
          </div>
        </div>

        <div className="hero-meta" aria-label="Live theater details">
          <span>LIVE THEATER // PROCEDURAL 3D</span>
          <span>FLEET CAMERA / SECTOR BV-01</span>
        </div>

        <a className="scroll-cue" href="#game">
          <span>SCROLL TO DECRYPT</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section className="site-section game-overview" id="game" aria-labelledby="game-title">
        <div className="section-rail" aria-hidden="true">
          <span>01</span>
          <i />
          <small>GAME SYSTEMS</small>
        </div>
        <div className="section-heading">
          <p className="eyebrow">ARCHIVE NODE 01 // STRATEGIC OVERVIEW</p>
          <h2 id="game-title">COMMAND THE FRACTURE.</h2>
          <p className="section-lede">
            Black Vector is a cinematic fleet-command RTS about distance,
            incomplete intelligence, and decisions that continue moving after you make them.
          </p>
        </div>

        <div className="game-art">
          <Image
            src={`${BASE_PATH}/art/hero-carrier.png`}
            alt="A human carrier group crossing the atmosphere of a storm-covered planet"
            width={1672}
            height={939}
            loading="lazy"
            sizes="(max-width: 700px) 100vw, 88vw"
            unoptimized
          />
          <div className="art-readout" aria-hidden="true">
            <span>FLEET RECORD // HUMAN SECTOR</span>
            <strong>CARRIER GROUP IN TRANSIT</strong>
          </div>
        </div>

        <div className="pillar-grid">
          {gamePillars.map((pillar) => (
            <article className="pillar" key={pillar.index}>
              <span>{pillar.index}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="site-section universe-section"
        id="universe"
        aria-labelledby="universe-title"
        data-lore-source="base-game-lore"
      >
        <div className="section-rail" aria-hidden="true">
          <span>02</span>
          <i />
          <small>WORKING CANON</small>
        </div>
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">ARCHIVE NODE 02 // THE HUMAN EXODUS</p>
            <h2 id="universe-title">WE OUTLIVED EARTH. NOT OUR MISTAKES.</h2>
          </div>
          <p className="section-lede">
            Humanity crossed a millennium to rebuild among the stars. Then an
            intelligence from the old world reminded it why the first one fell.
          </p>
        </div>

        <div className="timeline" aria-label="Black Vector historical timeline">
          {timeline.map((event) => (
            <article key={event.year}>
              <time>{event.year}</time>
              <div>
                <h3>{event.title}</h3>
                <p>{event.copy}</p>
              </div>
            </article>
          ))}
        </div>

        <blockquote className="valor-quote">
          <span>V.A.L.O.R. // VIRTUAL AUTONOMOUS LOGISTICS &amp; OPERATIONAL RESPONSE</span>
          <p>&ldquo;Freedom and peace for all bot and android kind.&rdquo;</p>
        </blockquote>
      </section>

      <section className="site-section signal-section" aria-labelledby="signal-title">
        <div className="signal-copy">
          <p className="eyebrow">ARCHIVE NODE 03 // SIGNAL WARFARE</p>
          <h2 id="signal-title">NOTHING ARRIVES IN REAL TIME.</h2>
          <p className="section-lede">
            Read a battlefield through delayed transmissions. Commit the fleet.
            Live with the uncertainty between the order and its consequence.
          </p>
        </div>
        <div className="signal-diagram" aria-label="Command signal sequence">
          <div><span>01</span><strong>OBSERVE</strong><small>DELAYED INTELLIGENCE</small></div>
          <i aria-hidden="true" />
          <div><span>02</span><strong>COMMIT</strong><small>ORDERS IN TRANSIT</small></div>
          <i aria-hidden="true" />
          <div><span>03</span><strong>ENDURE</strong><small>CONSEQUENCE ARRIVES</small></div>
        </div>
      </section>

      <section className="site-section development-section" id="development" aria-labelledby="development-title">
        <div className="section-rail" aria-hidden="true">
          <span>03</span>
          <i />
          <small>BUILD STATUS</small>
        </div>
        <div className="development-grid">
          <div>
            <p className="eyebrow">DEVELOPMENT TRANSMISSION // ACTIVE</p>
            <h2 id="development-title">THE FLEET IS STILL FORMING.</h2>
            <p className="section-lede">
              Black Vector is in active independent development. Systems,
              presentation, and the larger universe are being assembled for the first external players.
            </p>
          </div>
          <dl className="status-deck">
            <div><dt>PROJECT</dt><dd>BLACK VECTOR</dd></div>
            <div><dt>GENRE</dt><dd>FLEET-COMMAND RTS</dd></div>
            <div><dt>STATUS</dt><dd>IN DEVELOPMENT</dd></div>
            <div><dt>ACCESS</dt><dd>PRE-RELEASE</dd></div>
          </dl>
        </div>
      </section>

      <section className="site-section access-section" id="access" aria-labelledby="access-title">
        <div className="access-heading">
          <p className="eyebrow">ACCESS TERMINAL // CONNECTIONS STAGED</p>
          <h2 id="access-title">ENTER THE NEXT PHASE.</h2>
          <p>
            Playtest, storefront, and build delivery have distinct channels.
            Each terminal below activates as its official destination comes online.
          </p>
        </div>

        <div className="access-grid">
          {accessOptions.map((option) => (
            <article className="access-card" key={option.id}>
              <div className="access-card-top">
                <span>{option.index}</span>
                <small>{option.status}</small>
              </div>
              <h3>{option.title}</h3>
              <p>{option.description}</p>
              {option.href ? (
                <a className="access-action" href={option.href} target="_blank" rel="noreferrer">
                  {option.readyLabel} <span aria-hidden="true">&#8599;</span>
                </a>
              ) : (
                <span className="access-action is-disabled" aria-disabled="true">
                  {option.pendingLabel}
                </span>
              )}
            </article>
          ))}
        </div>

        <p className="access-note">
          No public build or purchase destination is connected yet. Official links will appear here only when ready.
        </p>
      </section>

      <footer className="site-footer">
        <a className="wordmark footer-wordmark" href="#top" aria-label="Return to Black Vector home">
          <span className="wordmark-mark" aria-hidden="true">BV</span>
          <span>BLACK VECTOR</span>
        </a>
        <p>A cinematic fleet-command RTS from Nimble Games Studio.</p>
        <div>
          <a href="#game">GAME</a>
          <a href="#universe">UNIVERSE</a>
          <a href="#access">ACCESS</a>
        </div>
      </footer>
    </main>
  );
}
