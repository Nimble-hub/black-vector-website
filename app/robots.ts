import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/login", "/register", "/api/"],
    },
    sitemap: "https://blackvector.win/sitemap.xml",
  };
}
