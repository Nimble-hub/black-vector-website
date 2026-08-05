import "server-only";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { gameBuild, gameDownloadEntitlement } from "@/db/schema";

export type GameBuildChannel = "playtest" | "release";
export type GameBuildPlatform = "windows";

export async function getCurrentGameBuild(
  channel: GameBuildChannel = "playtest",
  platform: GameBuildPlatform = "windows",
) {
  const [build] = await getDb()
    .select()
    .from(gameBuild)
    .where(
      and(
        eq(gameBuild.channel, channel),
        eq(gameBuild.platform, platform),
        eq(gameBuild.state, "published"),
      ),
    )
    .orderBy(desc(gameBuild.publishedAt), desc(gameBuild.createdAt))
    .limit(1);

  return build ?? null;
}

export async function hasGameDownloadEntitlement(
  userId: string,
  channel: GameBuildChannel = "playtest",
) {
  const [entitlement] = await getDb()
    .select({ id: gameDownloadEntitlement.id })
    .from(gameDownloadEntitlement)
    .where(
      and(
        eq(gameDownloadEntitlement.userId, userId),
        eq(gameDownloadEntitlement.channel, channel),
        eq(gameDownloadEntitlement.active, true),
        or(
          isNull(gameDownloadEntitlement.expiresAt),
          gt(gameDownloadEntitlement.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  return Boolean(entitlement);
}

export function isSafeGameBuildKey(key: string) {
  return key.startsWith("builds/") && !key.includes("..") && !key.startsWith("/");
}

export function safeDownloadFilename(filename: string) {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "Black-Vector-Playtest.zip";
}
