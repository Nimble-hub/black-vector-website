import Link from "next/link";

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
}: {
  basePath?: string;
  current?: StandalonePage;
  variant: "support" | "download" | "legal";
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        SKIP TO MAIN CONTENT
      </a>
      <header className={`${variant}-header standalone-header`}>
        <Link
          className={`auth-wordmark ${variant === "support" ? "support-wordmark" : ""} ${variant === "download" ? "download-wordmark" : ""} standalone-wordmark`}
          href={`${basePath}/`}
          aria-label="Return to Black Vector home"
        >
          <span>BV</span> BLACK VECTOR
          <sup className="trademark-symbol">&trade;</sup>
        </Link>
        <nav className="standalone-nav" aria-label="Site navigation">
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
      </header>
    </>
  );
}
