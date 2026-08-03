import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { isChatChannel } from "@/lib/community";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const messageInput = z.object({
  content: z.string().trim().min(1).max(500),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!isChatChannel(channel)) return Response.json({ error: "Unknown channel." }, { status: 404 });
  const response = await env.CHAT_ROOMS.getByName(channel).fetch("https://chat-room/recent");
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
  if (!isChatChannel(channel)) return Response.json({ error: "Unknown channel." }, { status: 404 });

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to transmit." }, { status: 401 });
  const parsed = messageInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Message must be 1–500 characters." }, { status: 400 });

  const response = await env.CHAT_ROOMS.getByName(channel).fetch("https://chat-room/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      channel,
      userId: session.user.id,
      displayName: session.user.name,
      avatarUrl: session.user.image || null,
      content: parsed.data.content,
    }),
  });
  return Response.json(await response.json(), { status: response.status });
}
