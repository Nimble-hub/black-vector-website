import { and, asc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getD1, getDb } from "@/db";
import { forumPost, forumThread, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { canModerate, getCommunityRole } from "@/lib/community-permissions";
import { isSameOriginRequest } from "@/lib/request-security";
import { createCommunityNotification } from "@/lib/community-notifications";

export const dynamic = "force-dynamic";

const replyInput = z.object({ body: z.string().trim().min(1).max(3000) });
const threadEditInput = z.object({
  kind: z.literal("thread"),
  title: z.string().trim().min(4).max(100),
  body: z.string().trim().min(10).max(4000),
});
const replyEditInput = z.object({
  kind: z.literal("reply"),
  replyId: z.string().uuid(),
  body: z.string().trim().min(1).max(3000),
});
const statusInput = z.object({
  kind: z.literal("status"),
  status: z.enum(["open", "resolved", "locked"]),
});
const updateInput = z.discriminatedUnion("kind", [threadEditInput, replyEditInput, statusInput]);
const deleteInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thread") }),
  z.object({ kind: z.literal("reply"), replyId: z.string().uuid() }),
]);

async function actor() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = await getCommunityRole(session.user.id);
  return { session, role };
}

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
      authorId: forumThread.authorId,
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
      authorId: forumPost.authorId,
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
  const identity = await actor();
  if (!identity) return Response.json({ error: "Sign in to reply." }, { status: 401 });
  const { threadId } = await params;
  const parsed = replyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Reply must be 1–3000 characters." }, { status: 400 });

  const db = getDb();
  const [thread] = await db.select({
    status: forumThread.status,
    authorId: forumThread.authorId,
    title: forumThread.title,
  }).from(forumThread).where(eq(forumThread.id, threadId)).limit(1);
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 });
  if (thread.status === "locked") return Response.json({ error: "This thread is locked." }, { status: 409 });
  const tooRecent = await db
    .select({ id: forumPost.id })
    .from(forumPost)
    .where(and(eq(forumPost.authorId, identity.session.user.id), gt(forumPost.createdAt, new Date(Date.now() - 4_000))))
    .limit(1);
  if (tooRecent.length) return Response.json({ error: "Transmission rate exceeded." }, { status: 429 });

  const now = Date.now();
  const id = crypto.randomUUID();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`INSERT INTO forum_post (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, threadId, identity.session.user.id, parsed.data.body, now, now),
    d1.prepare(`UPDATE forum_thread SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?`)
      .bind(now, threadId),
  ]);
  await createCommunityNotification({
    userId: thread.authorId,
    actorId: identity.session.user.id,
    type: "forum-reply",
    title: `New reply: ${thread.title}`,
    body: parsed.data.body,
    href: `/community?thread=${threadId}`,
  });
  return Response.json({
    reply: {
      id,
      body: parsed.data.body,
      authorId: identity.session.user.id,
      authorName: identity.session.user.name,
      authorImage: identity.session.user.image || null,
      createdAt: now,
      updatedAt: now,
    },
  }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const identity = await actor();
  if (!identity) return Response.json({ error: "Sign in to change community content." }, { status: 401 });
  const { threadId } = await params;
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the requested change." }, { status: 400 });

  const db = getDb();
  const [thread] = await db
    .select({ authorId: forumThread.authorId, status: forumThread.status })
    .from(forumThread)
    .where(eq(forumThread.id, threadId))
    .limit(1);
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 });

  if (parsed.data.kind === "status") {
    if (!canModerate(identity.role)) return Response.json({ error: "Moderator access required." }, { status: 403 });
    const updatedAt = new Date();
    await db.update(forumThread).set({ status: parsed.data.status, updatedAt }).where(eq(forumThread.id, threadId));
    return Response.json({ status: parsed.data.status, updatedAt });
  }

  if (parsed.data.kind === "thread") {
    if (thread.authorId !== identity.session.user.id) {
      return Response.json({ error: "Only the author can edit this thread." }, { status: 403 });
    }
    if (thread.status === "locked") return Response.json({ error: "This thread is locked." }, { status: 409 });
    const updatedAt = new Date();
    await db.update(forumThread).set({ title: parsed.data.title, body: parsed.data.body, updatedAt }).where(eq(forumThread.id, threadId));
    return Response.json({ thread: { title: parsed.data.title, body: parsed.data.body, updatedAt } });
  }

  const [post] = await db
    .select({ authorId: forumPost.authorId })
    .from(forumPost)
    .where(and(eq(forumPost.id, parsed.data.replyId), eq(forumPost.threadId, threadId)))
    .limit(1);
  if (!post) return Response.json({ error: "Reply not found." }, { status: 404 });
  if (post.authorId !== identity.session.user.id) return Response.json({ error: "Only the author can edit this reply." }, { status: 403 });
  if (thread.status === "locked") return Response.json({ error: "This thread is locked." }, { status: 409 });
  const updatedAt = new Date();
  await db.update(forumPost).set({ body: parsed.data.body, updatedAt }).where(eq(forumPost.id, parsed.data.replyId));
  return Response.json({ reply: { id: parsed.data.replyId, body: parsed.data.body, updatedAt } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const identity = await actor();
  if (!identity) return Response.json({ error: "Sign in to delete community content." }, { status: 401 });
  const { threadId } = await params;
  const parsed = deleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the requested deletion." }, { status: 400 });

  const db = getDb();
  const [thread] = await db
    .select({ authorId: forumThread.authorId })
    .from(forumThread)
    .where(eq(forumThread.id, threadId))
    .limit(1);
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 });

  if (parsed.data.kind === "thread") {
    if (thread.authorId !== identity.session.user.id && !canModerate(identity.role)) {
      return Response.json({ error: "You do not have permission to delete this thread." }, { status: 403 });
    }
    await db.delete(forumThread).where(eq(forumThread.id, threadId));
    return Response.json({ deletedId: threadId });
  }

  const [post] = await db
    .select({ authorId: forumPost.authorId })
    .from(forumPost)
    .where(and(eq(forumPost.id, parsed.data.replyId), eq(forumPost.threadId, threadId)))
    .limit(1);
  if (!post) return Response.json({ error: "Reply not found." }, { status: 404 });
  if (post.authorId !== identity.session.user.id && !canModerate(identity.role)) {
    return Response.json({ error: "You do not have permission to delete this reply." }, { status: 403 });
  }
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("DELETE FROM forum_post WHERE id = ? AND thread_id = ?").bind(parsed.data.replyId, threadId),
    d1.prepare("UPDATE forum_thread SET reply_count = CASE WHEN reply_count > 0 THEN reply_count - 1 ELSE 0 END, updated_at = ? WHERE id = ?")
      .bind(now, threadId),
  ]);
  return Response.json({ deletedId: parsed.data.replyId });
}
