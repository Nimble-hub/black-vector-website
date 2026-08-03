import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "@/db";
import {
  getCommunitySession,
  requireConversationMembership,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const messageInput = z.object({ content: z.string().trim().min(1).max(1000) });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view direct comms." },
      { status: 401 },
    );
  const { conversationId } = await params;
  const membership = await requireConversationMembership(
    conversationId,
    session.user.id,
  );
  if (!membership)
    return Response.json(
      { error: "Direct channel not found." },
      { status: 404 },
    );
  const response = await env.CHAT_ROOMS.getByName(`dm:${conversationId}`).fetch(
    "https://chat-room/recent",
  );
  return Response.json(await response.json(), { status: response.status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json({ error: "Sign in to transmit." }, { status: 401 });
  const { conversationId } = await params;
  const membership = await requireConversationMembership(
    conversationId,
    session.user.id,
  );
  if (!membership)
    return Response.json(
      { error: "Direct channel not found." },
      { status: 404 },
    );
  const parsed = messageInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Message must be 1–1000 characters." },
      { status: 400 },
    );
  const profile = await getD1()
    .prepare("SELECT name, image FROM user WHERE id = ? LIMIT 1")
    .bind(session.user.id)
    .first<{ name: string; image: string | null }>();
  const room = env.CHAT_ROOMS.getByName(`dm:${conversationId}`);
  const response = await room.fetch("https://chat-room/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      channel: `dm:${conversationId}`,
      userId: session.user.id,
      displayName: profile?.name ?? session.user.name,
      avatarUrl: profile?.image ?? null,
      content: parsed.data.content,
    }),
  });
  const payload = await response.json();
  if (response.ok) {
    await getD1()
      .prepare("UPDATE direct_conversation SET updated_at = ? WHERE id = ?")
      .bind(Date.now(), conversationId)
      .run();
  }
  return Response.json(payload, { status: response.status });
}
