import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "black-vector-website";
const basePath = githubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  ...(githubPages ? { output: "export" as const } : {}),
  ...(githubPages ? { typescript: { ignoreBuildErrors: true } } : {}),
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
