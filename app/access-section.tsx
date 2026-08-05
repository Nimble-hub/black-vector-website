import { DownloadAccessCard } from "./download-access-card";

const accessOptions = [
  {
    id: "playtest",
    index: "01",
    title: "Join the playtest",
    description:
      "Create a commander profile and apply for access to private Black Vector playtests.",
    readyLabel: "JOIN THE PLAYTEST",
    pendingLabel: "PLAYTEST INTAKE // OFFLINE",
    status: "PRE-RELEASE TESTING",
  },
  {
    id: "support",
    index: "02",
    title: "Support development",
    description:
      "Preview the upcoming supporter program, rewards, and ways to help fund development.",
    readyLabel: "PREVIEW THE PROGRAM",
    pendingLabel: "SUPPORT PROGRAM // COMING SOON",
    status: "TIERS IN DEVELOPMENT",
  },
] as const;

export function AccessSection({ basePath = "" }: { basePath?: string }) {
  const playtestHref =
    process.env.NEXT_PUBLIC_PLAYTEST_URL || `${basePath}/playtest`;

  return (
    <section
      className="site-section access-section"
      id="access"
      aria-labelledby="access-title"
    >
      <div className="access-heading">
        <div>
          <p className="eyebrow">PLAYTEST &amp; DEVELOPMENT</p>
          <h2 id="access-title">TAKE YOUR PLACE IN THE FLEET.</h2>
        </div>
        <p>
          Apply for private playtests, follow the supporter program, and access
          approved builds.
        </p>
      </div>

      <div className="access-grid">
        {accessOptions.map((option) => {
          const href =
            option.id === "playtest" ? playtestHref : `${basePath}/support`;
          return (
            <article className="access-card" id={option.id} key={option.id}>
              <div className="access-card-top">
                <span>{option.index}</span>
                <small>{option.status}</small>
              </div>
              <h3>{option.title}</h3>
              <p>{option.description}</p>
              {href ? (
                <a
                  className="access-action"
                  href={href}
                  {...(href.startsWith("http")
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {option.readyLabel}{" "}
                  <span aria-hidden="true">
                    {href.startsWith("http") ? "↗" : "→"}
                  </span>
                </a>
              ) : (
                <span className="access-action is-disabled" aria-disabled="true">
                  {option.pendingLabel}
                </span>
              )}
            </article>
          );
        })}
        <DownloadAccessCard basePath={basePath} />
      </div>

      <div className="access-footer-row">
        <p className="access-note">
          Private builds are available only to verified accounts approved for
          an active playtest.
        </p>
        <a className="access-page-link" href={`${basePath}/download`}>
          OPEN DOWNLOAD TERMINAL <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
