import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getD1 } from "@/db";
import { isChatChannel } from "@/lib/community";
import { canModerate, getCommunityRole } from "@/lib/community-permissions";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const messageInput = z.object({
  content: z.string().trim().min(1).max(500),
});
const mutationInput = z.object({
  id: z.string().uuid(),
  content: z.string().trim().min(1).max(500).optional(),
});

function friendlyError(value: unknown) {
  if (value === "MESSAGE_NOT_FOUND") return "That message no longer exists.";
  if (value === "FORBIDDEN")
    return "You do not have permission to change that message.";
  if (value === "RATE_LIMITED")
    return "Stand by before sending another message.";
  return typeof value === "string"
    ? value
    : "The message could not be changed.";
}

async function actor() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const [role, profile] = await Promise.all([
    getCommunityRole(session.user.id),
    getD1()
      .prepare("SELECT name, image FROM user WHERE id = ? LIMIT 1")
      .bind(session.user.id)
      .first<{ name: string; image: string | null }>(),
  ]);
  return { session, role, profile };
}

async function forwardMutation(response: Response) {
  const payload = (await response.json()) as {
    error?: string;
    message?: unknown;
    deletedId?: string;
  };
  if (!response.ok)
    return Response.json(
      { error: friendlyError(payload.error) },
      { status: response.status },
    );
  return Response.json(payload, { status: response.status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!isChatChannel(channel))
    return Response.json({ error: "Unknown channel." }, { status: 404 });
  const response = await env.CHAT_ROOMS.getByName(channel).fetch(
    "https://chat-room/recent",
  );
  return Response.json(await response.json(), { status: response.status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const { channel } = await params;
  if (!isChatChannel(channel))
    return Response.json({ error: "Unknown channel." }, { status: 404 });

  const identity = await actor();
  if (!identity)
    return Response.json({ error: "Sign in to transmit." }, { status: 401 });
  const parsed = messageInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Message must be 1–500 characters." },
      { status: 400 },
    );

  const response = await env.CHAT_ROOMS.getByName(channel).fetch(
    "https://chat-room/publish",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel,
        userId: identity.session.user.id,
        displayName: identity.profile?.name ?? identity.session.user.name,
        avatarUrl: identity.profile?.image ?? null,
        content: parsed.data.content,
      }),
    },
  );
  return forwardMutation(response);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { channel } = await params;
  if (!isChatChannel(channel))
    return Response.json({ error: "Unknown channel." }, { status: 404 });
  const identity = await actor();
  if (!identity)
    return Response.json(
      { error: "Sign in to edit a message." },
      { status: 401 },
    );
  const parsed = mutationInput
    .required({ content: true })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Message must be 1–500 characters." },
      { status: 400 },
    );

  const response = await env.CHAT_ROOMS.getByName(channel).fetch(
    "https://chat-room/message",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        actorUserId: identity.session.user.id,
        canModerate: canModerate(identity.role),
      }),
    },
  );
  return forwardMutation(response);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { channel } = await params;
  if (!isChatChannel(channel))
    return Response.json({ error: "Unknown channel." }, { status: 404 });
  const identity = await actor();
  if (!identity)
    return Response.json(
      { error: "Sign in to delete a message." },
      { status: 401 },
    );
  const parsed = mutationInput
    .pick({ id: true })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid message." }, { status: 400 });

  const response = await env.CHAT_ROOMS.getByName(channel).fetch(
    "https://chat-room/message",
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        actorUserId: identity.session.user.id,
        canModerate: canModerate(identity.role),
      }),
    },
  );
  return forwardMutation(response);
}
