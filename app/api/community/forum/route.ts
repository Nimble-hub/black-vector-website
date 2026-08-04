import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { forumThread, user } from "@/db/schema";
import { FORUM_CATEGORIES } from "@/lib/community";
import { getAuth } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { getPublicCommunityIdentity } from "@/lib/community-identity";

export const dynamic = "force-dynamic";

const categoryIds = FORUM_CATEGORIES.map((category) => category.id) as ["feedback", "suggestions", "bug-reports"];
const threadInput = z.object({
  category: z.enum(categoryIds),
  title: z.string().trim().min(4).max(100),
  body: z.string().trim().min(10).max(4000),
});

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category");
  const db = getDb();
  const query = db
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
    .orderBy(desc(forumThread.updatedAt))
    .limit(60);

  const threads = category && categoryIds.includes(category as typeof categoryIds[number])
    ? await query.where(eq(forumThread.category, category as typeof categoryIds[number]))
    : await query;
  return Response.json({ threads });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to open a thread." }, { status: 401 });
  const parsed = threadInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the category, title, and report details." }, { status: 400 });

  const db = getDb();
  const tooRecent = await db
    .select({ id: forumThread.id })
    .from(forumThread)
    .where(and(eq(forumThread.authorId, session.user.id), gt(forumThread.createdAt, new Date(Date.now() - 30_000))))
    .limit(1);
  if (tooRecent.length) return Response.json({ error: "Stand by before opening another thread." }, { status: 429 });

  const now = new Date();
  const thread = {
    id: crypto.randomUUID(),
    ...parsed.data,
    authorId: session.user.id,
    status: "open" as const,
    replyCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(forumThread).values(thread);
  const publicIdentity = await getPublicCommunityIdentity(session.user.id, {
    name: session.user.name,
    image: session.user.image || null,
  });
  return Response.json({ thread: { ...thread, authorName: publicIdentity.name, authorImage: publicIdentity.image } }, { status: 201 });
}
