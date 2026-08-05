import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  getCurrentGameBuild,
  hasGameDownloadEntitlement,
  isSafeGameBuildKey,
} from "@/lib/game-downloads";
import { getCommunityRole } from "@/lib/community-permissions";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

function json(data: Record<string, unknown>) {
  return Response.json(data, {
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET() {
  const build = await getCurrentGameBuild();
  if (!build || !isSafeGameBuildKey(build.objectKey)) {
    return json({ state: "offline" });
  }

  const stored = await getRuntimeEnv().GAME_BUILDS.head(build.objectKey);
  if (!stored || stored.size !== build.sizeBytes) {
    return json({ state: "offline" });
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return json({ state: "auth_required" });
  }
  if (!session.user.emailVerified) {
    return json({ state: "email_verification_required" });
  }

  const [role, entitled] = await Promise.all([
    getCommunityRole(session.user.id),
    hasGameDownloadEntitlement(session.user.id, build.channel),
  ]);
  if (role !== "admin" && !entitled) {
    return json({ state: "access_required" });
  }

  return json({
    state: "ready",
    version: build.version,
    platform: build.platform,
    sizeBytes: stored.size,
    filename: build.filename,
    sha256: build.sha256,
    downloadUrl: "/api/downloads/current",
  });
}
