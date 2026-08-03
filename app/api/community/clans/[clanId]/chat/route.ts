import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  getCommunitySession,
  requireClanMembership,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const messageInput = z.object({ content: z.string().trim().min(1).max(1000) });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> },
) {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view clan comms." },
      { status: 401 },
    );
  const { clanId } = await params;
  if (!(await requireClanMembership(clanId, session.user.id))) {
    return Response.json({ error: "Clan access required." }, { status: 403 });
  }
  const response = await env.CHAT_ROOMS.getByName(`clan:${clanId}`).fetch(
    "https://chat-room/recent",
  );
  return Response.json(await response.json(), { status: response.status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json({ error: "Sign in to transmit." }, { status: 401 });
  const { clanId } = await params;
  if (!(await requireClanMembership(clanId, session.user.id))) {
    return Response.json({ error: "Clan access required." }, { status: 403 });
  }
  const parsed = messageInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Message must be 1–1000 characters." },
      { status: 400 },
    );
  const response = await env.CHAT_ROOMS.getByName(`clan:${clanId}`).fetch(
    "https://chat-room/publish",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: `clan:${clanId}`,
        userId: session.user.id,
        displayName: session.user.name,
        avatarUrl: session.user.image || null,
        content: parsed.data.content,
      }),
    },
  );
  return Response.json(await response.json(), { status: response.status });
}
