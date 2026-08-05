import { headers } from "next/headers";
import { z } from "zod";
import { getD1 } from "@/db";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import { isSafeGameBuildKey, safeDownloadFilename } from "@/lib/game-downloads";
import { isSameOriginRequest } from "@/lib/request-security";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({
  objectKey: z.string().min(8).max(512),
  version: z.string().min(1).max(64),
  filename: z.string().min(1).max(180).optional(),
  channel: z.enum(["playtest", "release"]).default("playtest"),
  platform: z.literal("windows").default("windows"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  releaseNotes: z.string().max(8000).optional(),
  publish: z.boolean().default(false),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (await getCommunityRole(session.user.id)) !== "admin") {
    return Response.json({ error: "Administrator access required." }, { status: 403 });
  }

  const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSafeGameBuildKey(parsed.data?.objectKey ?? "")) {
    return Response.json({ error: "Invalid build manifest." }, { status: 400 });
  }

  const input = parsed.data;
  const stored = await getRuntimeEnv().GAME_BUILDS.head(input.objectKey);
  if (!stored) {
    return Response.json({ error: "The referenced R2 object does not exist." }, { status: 404 });
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const filename = safeDownloadFilename(
    input.filename ?? input.objectKey.split("/").at(-1) ?? "Black-Vector-Playtest.zip",
  );
  const state = input.publish ? "published" : "draft";
  const publishedAt = input.publish ? now : null;
  const d1 = getD1();
  const statements = [];
  if (input.publish) {
    statements.push(
      d1
        .prepare(
          "UPDATE game_build SET state = 'retired', updated_at = ? WHERE channel = ? AND platform = ? AND state = 'published'",
        )
        .bind(now, input.channel, input.platform),
    );
  }
  statements.push(
    d1
      .prepare(
        `INSERT INTO game_build
          (id, channel, platform, version, object_key, filename, size_bytes, sha256,
           release_notes, state, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(object_key) DO UPDATE SET
           channel = excluded.channel,
           platform = excluded.platform,
           version = excluded.version,
           filename = excluded.filename,
           size_bytes = excluded.size_bytes,
           sha256 = excluded.sha256,
           release_notes = excluded.release_notes,
           state = excluded.state,
           published_at = excluded.published_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        input.channel,
        input.platform,
        input.version,
        input.objectKey,
        filename,
        stored.size,
        input.sha256 ?? null,
        input.releaseNotes ?? null,
        state,
        publishedAt,
        now,
        now,
      ),
  );
  await d1.batch(statements);

  return Response.json({
    ok: true,
    state,
    version: input.version,
    filename,
    sizeBytes: stored.size,
  });
}
