"use client";

import { useEffect, useState } from "react";

const sectionLinks = [
  { id: "game", label: "GAME" },
  { id: "universe", label: "UNIVERSE" },
  { id: "development", label: "DEVELOPMENT" },
  { id: "access", label: "PLAYTEST" },
] as const;

export function SiteHeader({ basePath = "" }: { basePath?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 1120) setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    const sections = sectionLinks
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <a className="skip-link" href="#game">
        SKIP TO GAME OVERVIEW
      </a>
      <header className="site-header">
        <a
          className="wordmark"
          href="#top"
          aria-label="Black Vector home"
          onClick={closeMenu}
        >
          <span className="wordmark-mark" aria-hidden="true">
            BV
          </span>
          <span>BLACK VECTOR</span>
        </a>

        <nav
          className={`site-nav${menuOpen ? " is-open" : ""}`}
          id="primary-navigation"
          aria-label="Primary navigation"
        >
          {sectionLinks.map((item) => (
            <a
              href={`#${item.id}`}
              aria-current={activeSection === item.id ? "location" : undefined}
              onClick={closeMenu}
              key={item.id}
            >
              {item.label}
            </a>
          ))}
          <a href={`${basePath}/community`} onClick={closeMenu}>
            COMMUNITY
          </a>
          <a href={`${basePath}/account`} onClick={closeMenu}>
            ACCOUNT
          </a>
        </nav>

        <div className="header-status">
          <button
            className="menu-toggle"
            type="button"
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            {menuOpen ? "CLOSE" : "MENU"}
          </button>
          <div className="audio-controls">
            <button
              className="audio-toggle"
              type="button"
              data-audio-toggle
              aria-pressed="true"
            >
              AUDIO // ON
            </button>
            <label className="audio-volume-control">
              <span>VOL</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                defaultValue="100"
                aria-label="Cinematic audio volume"
                data-audio-volume
              />
              <output data-audio-volume-value aria-hidden="true">
                100
              </output>
            </label>
          </div>
          <div className="signal-state">
            <span aria-hidden="true" />
            UPLINK // ACTIVE
          </div>
        </div>
      </header>
    </>
  );
}
