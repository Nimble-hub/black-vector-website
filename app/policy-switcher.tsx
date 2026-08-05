import Link from "next/link";

type PolicyPage = "terms" | "privacy" | "legal";

const policyPages = [
  { id: "terms", label: "TERMS OF SERVICE", href: "/terms" },
  { id: "privacy", label: "PRIVACY NOTICE", href: "/privacy" },
  { id: "legal", label: "LEGAL NOTICES", href: "/legal" },
] as const;

export function PolicySwitcher({
  basePath = "",
  current,
}: {
  basePath?: string;
  current: PolicyPage;
}) {
  return (
    <nav className="policy-switcher" aria-label="Policies and legal notices">
      {policyPages.map((item) => (
        <Link
          href={`${basePath}${item.href}`}
          aria-current={current === item.id ? "page" : undefined}
          key={item.id}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
