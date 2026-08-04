import { env } from "cloudflare:workers";
import { z } from "zod";
import { getD1 } from "@/db";
import {
  getCommunitySession,
  requireConversationMembership,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";
import type { CommunityChatMessage } from "@/lib/community";
import { createCommunityNotification } from "@/lib/community-notifications";
import {
  EMAIL_REQUIRED_CONVERSATION_ID,
  EMAIL_REQUIRED_MESSAGE_ID,
  hasVerifiedContactEmail,
} from "@/lib/account-email";

export const dynamic = "force-dynamic";

const messageInput = z.object({
  content: z.string().trim().min(1).max(1000),
  replyToId: z.string().uuid().nullable().optional(),
});

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
  if (conversationId === EMAIL_REQUIRED_CONVERSATION_ID) {
    if (hasVerifiedContactEmail(session.user)) {
      return Response.json({ error: "Contact channel already verified." }, { status: 404 });
    }
    return Response.json({
      messages: [
        {
          id: EMAIL_REQUIRED_MESSAGE_ID,
          channel: `dm:${EMAIL_REQUIRED_CONVERSATION_ID}`,
          userId: "black-vector-command",
          displayName: "Black Vector Command",
          avatarUrl: null,
          content:
            "Commander, add and verify a contact email so we can reach you about playtest waves, access windows, security notices, and important Black Vector updates.",
          createdAt: new Date(session.user.createdAt).getTime(),
          updatedAt: null,
          replyTo: null,
        },
      ],
    });
  }
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
  if (conversationId === EMAIL_REQUIRED_CONVERSATION_ID) {
    return Response.json(
      { error: "This command channel is read-only." },
      { status: 403 },
    );
  }
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
      replyToId: parsed.data.replyToId ?? null,
    }),
  });
  const payload = (await response.json()) as {
    message?: CommunityChatMessage;
    error?: string;
  };
  if (response.ok) {
    await getD1()
      .prepare("UPDATE direct_conversation SET updated_at = ? WHERE id = ?")
      .bind(Date.now(), conversationId)
      .run();
    const recipientId =
      membership.user_low_id === session.user.id
        ? membership.user_high_id
        : membership.user_low_id;
    await createCommunityNotification({
      userId: recipientId,
      actorId: session.user.id,
      type: "direct-message",
      title: `Direct message from ${profile?.name ?? session.user.name}`,
      body: parsed.data.content,
      href: "/community?panel=direct",
    });
  }
  return Response.json(payload, { status: response.status });
}
