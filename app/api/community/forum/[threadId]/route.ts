import { and, asc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getD1, getDb } from "@/db";
import { forumPost, forumThread, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const replyInput = z.object({ body: z.string().trim().min(1).max(3000) });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const db = getDb();
  const threads = await db
    .select({
      id: forumThread.id,
      category: forumThread.category,
      title: forumThread.title,
      body: forumThread.body,
      status: forumThread.status,
      replyCount: forumThread.replyCount,
      createdAt: forumThread.createdAt,
      updatedAt: forumThread.updatedAt,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(forumThread)
    .innerJoin(user, eq(forumThread.authorId, user.id))
    .where(eq(forumThread.id, threadId))
    .limit(1);
  if (!threads[0]) return Response.json({ error: "Thread not found." }, { status: 404 });

  const replies = await db
    .select({
      id: forumPost.id,
      body: forumPost.body,
      createdAt: forumPost.createdAt,
      updatedAt: forumPost.updatedAt,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(forumPost)
    .innerJoin(user, eq(forumPost.authorId, user.id))
    .where(eq(forumPost.threadId, threadId))
    .orderBy(asc(forumPost.createdAt));
  return Response.json({ thread: threads[0], replies });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to reply." }, { status: 401 });
  const { threadId } = await params;
  const parsed = replyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Reply must be 1–3000 characters." }, { status: 400 });

  const db = getDb();
  const [thread] = await db.select({ status: forumThread.status }).from(forumThread).where(eq(forumThread.id, threadId)).limit(1);
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 });
  if (thread.status === "locked") return Response.json({ error: "This thread is locked." }, { status: 409 });
  const tooRecent = await db
    .select({ id: forumPost.id })
    .from(forumPost)
    .where(and(eq(forumPost.authorId, session.user.id), gt(forumPost.createdAt, new Date(Date.now() - 4_000))))
    .limit(1);
  if (tooRecent.length) return Response.json({ error: "Transmission rate exceeded." }, { status: 429 });

  const now = Date.now();
  const id = crypto.randomUUID();
  await getD1().batch([
    getD1().prepare(`INSERT INTO forum_post (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, threadId, session.user.id, parsed.data.body, now, now),
    getD1().prepare(`UPDATE forum_thread SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?`)
      .bind(now, threadId),
  ]);
  return Response.json({ reply: { id, body: parsed.data.body, authorName: session.user.name, authorImage: session.user.image || null, createdAt: now, updatedAt: now } }, { status: 201 });
}
