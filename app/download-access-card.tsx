"use client";

import { useEffect, useState } from "react";

type DownloadState =
  | "checking"
  | "offline"
  | "auth_required"
  | "email_verification_required"
  | "access_required"
  | "ready";

type DownloadStatus = {
  state: DownloadState;
  version?: string;
  sizeBytes?: number;
  platform?: string;
  filename?: string;
  downloadUrl?: string;
};

const STATE_COPY: Record<
  DownloadState,
  { status: string; label: string; detail: string; href?: string }
> = {
  checking: {
    status: "NODE HANDSHAKE",
    label: "CHECKING BUILD AVAILABILITY",
    detail: "Secure build channel handshake in progress.",
  },
  offline: {
    status: "NODE OFFLINE",
    label: "GAME DOWNLOAD // OFFLINE",
    detail: "No approved build is deployed. This terminal will activate for the first private playtest.",
  },
  auth_required: {
    status: "IDENTITY REQUIRED",
    label: "SIGN IN TO DOWNLOAD",
    detail: "The private build channel is online. Authenticate to check your playtest clearance.",
    href: "/login?returnTo=%2Fdownload",
  },
  email_verification_required: {
    status: "VERIFICATION REQUIRED",
    label: "VERIFY EMAIL TO DOWNLOAD",
    detail: "Confirm your contact email before receiving private build access.",
    href: "/account",
  },
  access_required: {
    status: "CLEARANCE REQUIRED",
    label: "REQUEST PLAYTEST ACCESS",
    detail: "Your account is connected, but this release is limited to approved playtesters.",
    href: "/account?tab=playtest",
  },
  ready: {
    status: "NODE ONLINE",
    label: "DOWNLOAD BLACK VECTOR",
    detail: "Your account is cleared for the current private playtest build.",
  },
};

function formatBytes(bytes?: number) {
  if (!bytes || bytes < 1) return null;
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent > 2 ? 1 : 0)} ${units[exponent]}`;
}

export function DownloadAccessCard({
  basePath = "",
  variant = "card",
}: {
  basePath?: string;
  variant?: "card" | "terminal";
}) {
  const [download, setDownload] = useState<DownloadStatus>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${basePath}/api/downloads/status`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Build status unavailable");
        return (await response.json()) as DownloadStatus;
      })
      .then(setDownload)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDownload({ state: "offline" });
        }
      });
    return () => controller.abort();
  }, [basePath]);

  const copy = STATE_COPY[download.state] ?? STATE_COPY.offline;
  const href =
    download.state === "ready"
      ? `${basePath}${download.downloadUrl ?? "/api/downloads/current"}`
      : copy.href
        ? `${basePath}${copy.href}`
        : null;
  const size = formatBytes(download.sizeBytes);

  return (
    <article
      className={`access-card download-node-card${
        variant === "terminal" ? " download-terminal-card" : ""
      }`}
      data-download-state={download.state}
      id="download"
      aria-live="polite"
    >
      <div className="access-card-top">
        <span>{variant === "terminal" ? "BUILD CHANNEL // WINDOWS" : "03"}</span>
        <small className="download-node-state">
          <i aria-hidden="true" />
          {copy.status}
        </small>
      </div>
      <h3>Download a build</h3>
      <p>{copy.detail}</p>
      {download.state === "ready" && (download.version || size) ? (
        <p className="download-build-meta">
          {download.version ? `BUILD ${download.version}` : "CURRENT BUILD"}
          {size ? ` // ${size}` : ""}
          {download.filename ? ` // ${download.filename}` : ""}
        </p>
      ) : null}
      {href ? (
        <a
          className="access-action"
          href={href}
          aria-label={
            download.state === "ready"
              ? "Download the current Black Vector Windows build"
              : undefined
          }
        >
          {copy.label} <span aria-hidden="true">→</span>
        </a>
      ) : (
        <span className="access-action is-disabled" aria-disabled="true">
          {copy.label}
        </span>
      )}
    </article>
  );
}
