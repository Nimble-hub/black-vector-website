import { DownloadAccessCard } from "./download-access-card";

const accessOptions = [
  {
    id: "playtest",
    index: "01",
    title: "Join the playtest",
    description:
      "Create a commander profile, join the candidate pool, and help shape Black Vector before release.",
    readyLabel: "JOIN THE PLAYTEST",
    pendingLabel: "PLAYTEST INTAKE // OFFLINE",
    status: "PRE-RELEASE TESTING",
  },
  {
    id: "purchase",
    index: "02",
    title: "Purchase the game",
    description:
      "The official storefront will become the permanent home for ownership, updates, and the full release.",
    readyLabel: "OPEN STOREFRONT",
    pendingLabel: "STOREFRONT // OFFLINE",
    status: "NOT YET FOR SALE",
  },
] as const;

export function AccessSection({ basePath = "" }: { basePath?: string }) {
  const playtestHref =
    process.env.NEXT_PUBLIC_PLAYTEST_URL || `${basePath}/playtest`;
  const purchaseHref = process.env.NEXT_PUBLIC_PURCHASE_URL;

  return (
    <section
      className="site-section access-section"
      id="access"
      aria-labelledby="access-title"
    >
      <div className="access-heading">
        <div>
          <p className="eyebrow">PLAYTEST &amp; RELEASE ACCESS</p>
          <h2 id="access-title">TAKE YOUR PLACE IN THE FLEET.</h2>
        </div>
        <p>
          Join the playtest now, monitor build availability, or continue to the
          official storefront when Black Vector is ready for release.
        </p>
      </div>

      <div className="access-grid">
        {accessOptions.map((option) => {
          const href = option.id === "playtest" ? playtestHref : purchaseHref;
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
          Private builds are tied to verified accounts and activate only for
          approved playtesters when a release is available.
        </p>
        <a className="access-page-link" href={`${basePath}/download`}>
          OPEN DOWNLOAD TERMINAL <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
