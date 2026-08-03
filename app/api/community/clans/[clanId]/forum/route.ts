import { z } from "zod";
import { getD1 } from "@/db";
import {
  getCommunitySession,
  requireClanMembership,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const postInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("thread"),
    title: z.string().trim().min(4).max(100),
    body: z.string().trim().min(4).max(4000),
  }),
  z.object({
    kind: z.literal("reply"),
    threadId: z.string().uuid(),
    body: z.string().trim().min(1).max(3000),
  }),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> },
) {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view clan operations." },
      { status: 401 },
    );
  const { clanId } = await params;
  if (!(await requireClanMembership(clanId, session.user.id))) {
    return Response.json({ error: "Clan access required." }, { status: 403 });
  }
  const d1 = getD1();
  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) {
    const threads = await d1
      .prepare(
        `
      SELECT t.id, t.title, t.body, t.status, t.reply_count, t.created_at, t.updated_at,
             t.author_id, u.name AS author_name, u.image AS author_image
      FROM clan_forum_thread t
      JOIN user u ON u.id = t.author_id
      WHERE t.clan_id = ?
      ORDER BY t.updated_at DESC
      LIMIT 60
    `,
      )
      .bind(clanId)
      .all();
    return Response.json({ threads: threads.results });
  }
  const thread = await d1
    .prepare(
      `
    SELECT t.id, t.title, t.body, t.status, t.reply_count, t.created_at, t.updated_at,
           t.author_id, u.name AS author_name, u.image AS author_image
    FROM clan_forum_thread t
    JOIN user u ON u.id = t.author_id
    WHERE t.id = ? AND t.clan_id = ? LIMIT 1
  `,
    )
    .bind(threadId, clanId)
    .first();
  if (!thread)
    return Response.json({ error: "Clan thread not found." }, { status: 404 });
  const replies = await d1
    .prepare(
      `
    SELECT p.id, p.body, p.created_at, p.updated_at, p.author_id,
           u.name AS author_name, u.image AS author_image
    FROM clan_forum_post p
    JOIN user u ON u.id = p.author_id
    WHERE p.thread_id = ? ORDER BY p.created_at ASC
  `,
    )
    .bind(threadId)
    .all();
  return Response.json({ thread, replies: replies.results });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to post to clan operations." },
      { status: 401 },
    );
  const { clanId } = await params;
  if (!(await requireClanMembership(clanId, session.user.id))) {
    return Response.json({ error: "Clan access required." }, { status: 403 });
  }
  const parsed = postInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Check the transmission details." },
      { status: 400 },
    );
  const d1 = getD1();
  const now = Date.now();
  const id = crypto.randomUUID();
  if (parsed.data.kind === "thread") {
    await d1
      .prepare(
        `
      INSERT INTO clan_forum_thread
        (id, clan_id, author_id, title, body, status, reply_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', 0, ?, ?)
    `,
      )
      .bind(
        id,
        clanId,
        session.user.id,
        parsed.data.title,
        parsed.data.body,
        now,
        now,
      )
      .run();
    return Response.json({ id }, { status: 201 });
  }
  const thread = await d1
    .prepare(
      "SELECT id, status FROM clan_forum_thread WHERE id = ? AND clan_id = ? LIMIT 1",
    )
    .bind(parsed.data.threadId, clanId)
    .first<{ id: string; status: string }>();
  if (!thread)
    return Response.json({ error: "Clan thread not found." }, { status: 404 });
  if (thread.status === "locked")
    return Response.json(
      { error: "This clan thread is locked." },
      { status: 409 },
    );
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO clan_forum_post (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, thread.id, session.user.id, parsed.data.body, now, now),
    d1
      .prepare(
        `UPDATE clan_forum_thread SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?`,
      )
      .bind(now, thread.id),
  ]);
  return Response.json({ id }, { status: 201 });
}
