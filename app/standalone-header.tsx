"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type StandalonePage = "download" | "support" | "community" | "account";

const navigation = [
  { id: "home", label: "HOME", href: "/" },
  { id: "playtest", label: "PLAYTEST", href: "/playtest" },
  { id: "download", label: "DOWNLOAD", href: "/download" },
  { id: "support", label: "SUPPORT", href: "/support" },
  { id: "community", label: "COMMUNITY", href: "/community" },
  { id: "account", label: "ACCOUNT", href: "/account" },
] as const;

export function StandaloneHeader({
  basePath = "",
  current,
  variant,
  actions,
  skipTarget = "main-content",
  skipLabel = "SKIP TO MAIN CONTENT",
}: {
  basePath?: string;
  current?: StandalonePage;
  variant: "support" | "download" | "legal" | "account" | "community";
  actions?: ReactNode;
  skipTarget?: string;
  skipLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  return (
    <>
      <a className="skip-link" href={`#${skipTarget}`}>
        {skipLabel}
      </a>
      <header ref={headerRef} className={`${variant}-header standalone-header`}>
        <Link
          className={`auth-wordmark ${variant === "support" ? "support-wordmark" : ""} ${variant === "download" ? "download-wordmark" : ""} standalone-wordmark`}
          href={`${basePath}/`}
          aria-label="Return to Black Vector home"
        >
          <span>BV</span> BLACK VECTOR
          <sup className="trademark-symbol">&trade;</sup>
        </Link>
        <button ref={toggleRef} type="button" className="standalone-menu-toggle" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "CLOSE" : "MENU"}<span aria-hidden="true">{menuOpen ? " ×" : " +"}</span>
        </button>
        <nav id={menuId} className={`standalone-nav${menuOpen ? " is-open" : ""}`} aria-label="Site navigation" onClick={() => setMenuOpen(false)}>
          {navigation.map((item) =>
            current === item.id ? (
              <span aria-current="page" key={item.id}>
                {item.label}
              </span>
            ) : (
              <Link href={`${basePath}${item.href}`} key={item.id}>
                {item.label}
              </Link>
            ),
          )}
        </nav>
        {actions ? <div className="standalone-actions">{actions}</div> : null}
      </header>
    </>
  );
}
