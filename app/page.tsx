import type { Metadata } from "next";
import Image from "next/image";
import { preload } from "react-dom";
import { HyperspaceIntro } from "./hyperspace-intro";
import { SiteHeader } from "./site-header";
import { AccessSection } from "./access-section";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/PAasrdjBqe";

export const metadata: Metadata = {
  title: "Black Vector | Large-Scale Fleet-Command RTS",
  description:
    "Build fleets, capture strategic territory, grow a wartime economy, and command massive real-time battles across human space.",
};

const gamePillars = [
  {
    index: "01",
    title: "Build the war machine",
    copy: "Secure resources, expand production, and turn a foothold into an armada of fighters, warships, and capital vessels.",
  },
  {
    index: "02",
    title: "Control the system",
    copy: "Capture strategic positions, defend critical infrastructure, and pressure the enemy across multiple fronts.",
  },
  {
    index: "03",
    title: "Command at scale",
    copy: "Coordinate formations from strike craft to carrier groups as skirmishes escalate into battles for entire sectors.",
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
  preload(`${BASE_PATH}/textures/bv-abyssal-ocean.webp`, {
    as: "image",
    crossOrigin: "anonymous",
  });
  preload(`${BASE_PATH}/textures/bv-planetary-storm-clouds-v3.webp`, {
    as: "image",
    crossOrigin: "anonymous",
  });
  preload(`${BASE_PATH}/textures/bv-planetary-storm-cloud-height-v3.webp`, {
    as: "image",
    crossOrigin: "anonymous",
  });
  for (const model of [
    "Carrier.glb",
    "Cruiser.glb",
    "Fighter.glb",
    "Patrol-Cutter.glb",
    "Recon.glb",
  ]) {
    preload(`${BASE_PATH}/models/${model}`, {
      as: "fetch",
      crossOrigin: "anonymous",
    });
  }

  return (
    <main>
      <HyperspaceIntro />
      <SiteHeader basePath={BASE_PATH} />

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div
          className="world-label world-label-planet"
          data-world-anchor="planet"
          aria-hidden="true"
        >
          <span>CELESTIAL CONTACT // PRIMARY</span>
          <strong>UNREGISTERED STORMWORLD</strong>
          <small>ORBITAL SOLUTION LOCKED</small>
        </div>

        <div
          className="world-label world-label-flagship"
          data-world-anchor="flagship"
          aria-hidden="true"
        >
          <span>FLEET CONTACT // 01</span>
          <strong>CARRIER GROUP</strong>
          <small>FORMATION HOLDING</small>
        </div>

        <div className="hero-content" data-world-ui="hero">
          <p className="eyebrow">THE 27-DAY SKIRMISH // AFTER-ACTION ARCHIVE</p>
          <h1 id="hero-title">
            THE MACHINES LEFT.
            <span>THE WAR BEGAN.</span>
          </h1>
          <p className="hero-copy">
            Build an economy, assemble massive fleets, and fight for control of
            human space in real-time battles where every front can become a war.
          </p>
          <div className="hero-actions">
            <div className="hero-action-row">
              <a className="primary-action" href="#game">
                EXPLORE THE GAME <span aria-hidden="true">&#8600;</span>
              </a>
              <a className="secondary-action" href={`${BASE_PATH}/playtest`}>
                JOIN THE PLAYTEST <span aria-hidden="true">&#8594;</span>
              </a>
              <button
                className="text-action replay-action"
                type="button"
                data-replay-jump
              >
                REPLAY JUMP
              </button>
            </div>
            <a
              className="discord-action"
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Join the Nimble Game Studios Discord community (opens in a new tab)"
            >
              <span className="discord-action-brand" aria-hidden="true">
                <Image
                  className="discord-action-logo"
                  src={`${BASE_PATH}/brand/ngs-logo-fullcolor.png`}
                  alt=""
                  width={1717}
                  height={916}
                  sizes="(max-width: 700px) 140px, 180px"
                  unoptimized
                />
              </span>
              <span className="discord-action-copy">
                <small>OFFICIAL NGS COMMUNITY // LIVE</small>
                <strong>JOIN THE DISCORD</strong>
                <em>MEET THE CREW · FOLLOW DEVELOPMENT · FIND PLAYTESTERS</em>
              </span>
              <span className="discord-action-enter" aria-hidden="true">
                <b>ENTER</b>
                <i>&#8599;</i>
              </span>
            </a>
          </div>
          <div className="hero-facts" aria-label="Black Vector game features">
            <span>SYSTEM-SCALE SKIRMISHES</span>
            <span>REAL-TIME FLEET COMMAND</span>
            <span>WARTIME ECONOMY</span>
          </div>
        </div>

        <a className="hero-playtest-cta" href={`${BASE_PATH}/playtest`}>
          <span>PLAYTEST INTAKE // OPEN</span>
          <strong>JOIN THE PLAYTEST</strong>
          <small>CREATE PROFILE OR CONTINUE TO BUILD ACCESS</small>
          <i aria-hidden="true">&#8594;</i>
        </a>

        <a className="scroll-cue" href="#game">
          <span>SCROLL TO EXPLORE</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <AccessSection basePath={BASE_PATH} />

      <section
        className="site-section game-overview"
        id="game"
        aria-labelledby="game-title"
      >
        <div className="section-rail" aria-hidden="true">
          <span>01</span>
          <i />
          <small>GAME SYSTEMS</small>
        </div>
        <div className="section-heading">
          <p className="eyebrow">GAMEPLAY // STRATEGIC OVERVIEW</p>
          <h2 id="game-title">BUILD AN ARMADA. BREAK THE LINE.</h2>
          <p className="section-lede">
            Black Vector is a large-scale space RTS built around territorial
            expansion, fleet production, and real-time battles for control of
            entire star systems.
          </p>
        </div>

        <div className="game-art">
          <Image
            src={`${BASE_PATH}/art/hero-carrier.png`}
            alt="A colossal Black Vector fleet passing above an orbital city"
            width={1935}
            height={813}
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
            <p className="eyebrow">THE UNIVERSE // THE HUMAN EXODUS</p>
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
          <span>
            V.A.L.O.R. // VIRTUAL AUTONOMOUS LOGISTICS &amp; OPERATIONAL
            RESPONSE
          </span>
          <p>&ldquo;Freedom and peace for all bot and android kind.&rdquo;</p>
        </blockquote>
      </section>

      <section
        className="site-section signal-section"
        aria-labelledby="signal-title"
      >
        <div className="signal-copy">
          <p className="eyebrow">THE WAR AT SCALE // STRATEGIC ESCALATION</p>
          <h2 id="signal-title">FROM FOOTHOLD TO ARMADA.</h2>
          <p className="section-lede">
            Every skirmish begins with limited reach. Claim territory, grow your
            industrial base, and field the fleet that will decide control of the
            system.
          </p>
        </div>
        <div
          className="signal-diagram"
          aria-label="Strategic escalation sequence"
        >
          <div>
            <span>01</span>
            <strong>EXPAND</strong>
            <small>SECURE TERRITORY</small>
          </div>
          <i aria-hidden="true" />
          <div>
            <span>02</span>
            <strong>PRODUCE</strong>
            <small>BUILD THE FLEET</small>
          </div>
          <i aria-hidden="true" />
          <div>
            <span>03</span>
            <strong>CONQUER</strong>
            <small>CONTROL THE SYSTEM</small>
          </div>
        </div>
      </section>

      <section
        className="site-section development-section"
        id="development"
        aria-labelledby="development-title"
      >
        <div className="section-rail" aria-hidden="true">
          <span>03</span>
          <i />
          <small>BUILD STATUS</small>
        </div>
        <div className="development-grid">
          <div>
            <p className="eyebrow">IN ACTIVE DEVELOPMENT</p>
            <h2 id="development-title">THE FLEET IS STILL FORMING.</h2>
            <p className="section-lede">
              Black Vector is in active independent development. Systems,
              presentation, and the larger universe are being assembled for the
              first external players.
            </p>
          </div>
          <dl className="status-deck">
            <div>
              <dt>PROJECT</dt>
              <dd>BLACK VECTOR</dd>
            </div>
            <div>
              <dt>GENRE</dt>
              <dd>FLEET-COMMAND RTS</dd>
            </div>
            <div>
              <dt>STATUS</dt>
              <dd>IN DEVELOPMENT</dd>
            </div>
            <div>
              <dt>ACCESS</dt>
              <dd>PRE-RELEASE</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="site-footer">
        <a
          className="wordmark footer-wordmark"
          href="#top"
          aria-label="Return to Black Vector home"
        >
          <span className="wordmark-mark" aria-hidden="true">
            BV
          </span>
          <span>
            BLACK VECTOR<sup className="trademark-symbol">™</sup>
          </span>
        </a>
        <p className="footer-legal">
          <span>A large-scale fleet-command RTS from Nimble Game Studios.</span>
          <small>
            © 2026 Nimble Game Studios. BLACK VECTOR™ is a trademark of
            Nimble Game Studios. All rights reserved.
          </small>
        </p>
        <div>
          <a href="#game">GAME</a>
          <a href="#universe">UNIVERSE</a>
          <a href="#development">DEVELOPMENT</a>
          <a href="#access">ACCESS</a>
          <a href={`${BASE_PATH}/download`}>DOWNLOAD</a>
          <a href={`${BASE_PATH}/support`}>SUPPORT</a>
          <a href={`${BASE_PATH}/community`}>COMMUNITY</a>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
            DISCORD
          </a>
          <a href={`${BASE_PATH}/account`}>ACCOUNT</a>
          <a href={`${BASE_PATH}/nimble-game-studios`}>NGS</a>
          <a href={`${BASE_PATH}/terms`}>TERMS</a>
          <a href={`${BASE_PATH}/privacy`}>PRIVACY</a>
          <a href={`${BASE_PATH}/legal`}>LEGAL NOTICES</a>
        </div>
      </footer>
    </main>
  );
}
