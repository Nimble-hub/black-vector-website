import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const MAX_AVATAR_BYTES = 400 * 1024;

function isWebP(bytes: Uint8Array) {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File) || file.type !== "image/webp" || file.size < 32 || file.size > MAX_AVATAR_BYTES) {
    return Response.json({ error: "Upload a valid profile image under 400 KB." }, { status: 400 });
  }
  const data = await file.arrayBuffer();
  if (!isWebP(new Uint8Array(data))) return Response.json({ error: "Invalid image data." }, { status: 400 });

  const version = crypto.randomUUID();
  await env.PROFILE_MEDIA.put(`profile:${session.user.id}`, data, {
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { version },
  });
  const image = `/media/profile/${session.user.id}.webp?v=${version}`;
  await getDb().update(user).set({ image, updatedAt: new Date() }).where(eq(user.id, session.user.id));
  return Response.json({ image });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await Promise.all([
    env.PROFILE_MEDIA.delete(`profile:${session.user.id}`),
    getDb().update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, session.user.id)),
  ]);
  return Response.json({ ok: true });
}
