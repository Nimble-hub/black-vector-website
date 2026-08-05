import type { MetadataRoute } from "next";

const SITE_URL = "https://blackvector.win";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE_URL}/nimble-game-studios`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    { url: `${SITE_URL}/community`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/playtest`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/legal`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
