import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import {
  getCurrentGameBuild,
  hasGameDownloadEntitlement,
  isSafeGameBuildKey,
  safeDownloadFilename,
} from "@/lib/game-downloads";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

function error(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

async function serveBuild(request: Request, headOnly: boolean) {
  const build = await getCurrentGameBuild();
  if (!build || !isSafeGameBuildKey(build.objectKey)) {
    return error("The build distribution node is offline.", 503);
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return error("Sign in to access private builds.", 401);
  if (!session.user.emailVerified) {
    return error("Verify your contact email before downloading a build.", 403);
  }

  const [role, entitled] = await Promise.all([
    getCommunityRole(session.user.id),
    hasGameDownloadEntitlement(session.user.id, build.channel),
  ]);
  if (role !== "admin" && !entitled) {
    return error("This account has not been approved for this playtest build.", 403);
  }

  const bucket = getRuntimeEnv().GAME_BUILDS;
  let stored: R2Object | R2ObjectBody | null;
  try {
    stored = headOnly
      ? await bucket.head(build.objectKey)
      : await bucket.get(build.objectKey, { range: request.headers });
  } catch {
    return error("The requested byte range is unavailable.", 416);
  }
  if (!stored || stored.size !== build.sizeBytes) {
    return error("The published build is temporarily unavailable.", 503);
  }

  const responseHeaders = new Headers();
  stored.writeHttpMetadata(responseHeaders);
  const filename = safeDownloadFilename(build.filename);
  responseHeaders.set("content-type", "application/octet-stream");
  responseHeaders.set(
    "content-disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  responseHeaders.set("accept-ranges", "bytes");
  responseHeaders.set("cache-control", "private, no-store");
  responseHeaders.set("etag", stored.httpEtag);
  responseHeaders.set("x-content-type-options", "nosniff");
  if (build.sha256) responseHeaders.set("x-checksum-sha256", build.sha256);

  const range = stored.range;
  if (!headOnly && request.headers.has("range") && range) {
    const suffix = "suffix" in range ? range.suffix : undefined;
    const length = suffix
      ? Math.min(suffix, stored.size)
      : "length" in range && range.length
        ? range.length
        : stored.size - ("offset" in range ? (range.offset ?? 0) : 0);
    const offset = suffix
      ? stored.size - length
      : "offset" in range
        ? (range.offset ?? 0)
        : 0;
    responseHeaders.set(
      "content-range",
      `bytes ${offset}-${offset + length - 1}/${stored.size}`,
    );
    responseHeaders.set("content-length", String(length));
  } else {
    responseHeaders.set("content-length", String(stored.size));
  }

  const status = !headOnly && request.headers.has("range") && range ? 206 : 200;
  const body = headOnly ? null : (stored as R2ObjectBody).body;
  return new Response(body, { status, headers: responseHeaders });
}

export function GET(request: Request) {
  return serveBuild(request, false);
}

export function HEAD(request: Request) {
  return serveBuild(request, true);
}
