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
    status: "CHECKING STATUS",
    label: "CHECKING BUILD AVAILABILITY",
    detail: "Retrieving the latest release status.",
  },
  offline: {
    status: "NO ACTIVE RELEASE",
    label: "GAME DOWNLOAD // OFFLINE",
    detail: "Black Vector builds will become available here when the next private playtest begins.",
  },
  auth_required: {
    status: "IDENTITY REQUIRED",
    label: "SIGN IN TO DOWNLOAD",
    detail: "Sign in to view your playtest access and available releases.",
    href: "/login?returnTo=%2Fdownload",
  },
  email_verification_required: {
    status: "VERIFICATION REQUIRED",
    label: "VERIFY EMAIL TO DOWNLOAD",
    detail: "Verify your email before downloading a private playtest build.",
    href: "/account",
  },
  access_required: {
    status: "CLEARANCE REQUIRED",
    label: "REQUEST PLAYTEST ACCESS",
    detail: "Apply for playtest access to become eligible for private builds.",
    href: "/account?tab=playtest",
  },
  ready: {
    status: "RELEASE AVAILABLE",
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

  if (variant === "card") {
    return (
      <a
        className="access-card access-card-link download-node-card"
        data-download-state={download.state}
        id="download"
        href={`${basePath}/download`}
        aria-label="Open the Black Vector download page"
        aria-live="polite"
      >
        <div className="access-card-top">
          <span>03</span>
          <small className="download-node-state">
            <i aria-hidden="true" />
            {copy.status}
          </small>
        </div>
        <h3>Black Vector for Windows</h3>
        <p>{copy.detail}</p>
        <span className="access-action">
          OPEN DOWNLOAD PAGE <span aria-hidden="true">&#8594;</span>
        </span>
      </a>
    );
  }

  return (
    <article
      className="access-card download-node-card download-terminal-card"
      data-download-state={download.state}
      id="download"
      aria-live="polite"
    >
      <div className="access-card-top">
        <span>BUILD CHANNEL // WINDOWS</span>
        <small className="download-node-state">
          <i aria-hidden="true" />
          {copy.status}
        </small>
      </div>
      <h3>Black Vector for Windows</h3>
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
