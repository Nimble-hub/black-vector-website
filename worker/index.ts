/** Cloudflare Worker entry point for the vinext-starter template. */
import handler from "vinext/server/app-router-entry";
export { ChatRoom } from "./chat-room";

// Wrangler generates every application binding in `Env`. vinext's static
// asset runtime supplies this optional binding outside the generated set.
type WorkerEnv = Env & { ASSETS?: Fetcher };

function requestMatchesEtag(request: Request, etag: string): boolean {
  const candidates = request.headers.get("if-none-match");
  if (!candidates) return false;
  const normalizedEtag = etag.replace(/^W\//i, "");
  return candidates.split(",").some((candidate) => {
    const normalizedCandidate = candidate.trim().replace(/^W\//i, "");
    return normalizedCandidate === "*" || normalizedCandidate === normalizedEtag;
  });
}

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "www.blackvector.win") {
      url.hostname = "blackvector.win";
      return Response.redirect(url.toString(), 308);
    }

    const chatSocket = url.pathname.match(/^\/api\/community\/chat\/([a-z-]+)\/socket$/);
    if (chatSocket && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const channel = chatSocket[1];
      if (!["general", "fleet-tactics", "lore", "playtest-ops"].includes(channel)) {
        return new Response("Unknown comms channel", { status: 404 });
      }
      return env.CHAT_ROOMS.getByName(channel).fetch(request);
    }

    const profileImage = url.pathname.match(/^\/media\/profile\/([0-9a-f-]{36})\.webp$/i);
    if (profileImage && (request.method === "GET" || request.method === "HEAD")) {
      const key = `profile:${profileImage[1]}`;
      const stored = request.method === "HEAD"
        ? await env.PROFILE_MEDIA.head(key)
        : await env.PROFILE_MEDIA.get(key);
      if (!stored) return new Response("Profile image not found", { status: 404 });
      const responseHeaders = new Headers({
        "content-type": stored.httpMetadata?.contentType || "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      });
      responseHeaders.set("etag", stored.httpEtag);
      if (requestMatchesEtag(request, stored.httpEtag)) {
        return new Response(null, { status: 304, headers: responseHeaders });
      }
      const body = request.method === "HEAD" ? null : (stored as R2ObjectBody).body;
      return new Response(body, { headers: responseHeaders });
    }

    const cinematicMedia = url.pathname.match(/^\/media\/cinematic\/(hyperspace\/v[0-9]+\/.+)$/i);
    if (cinematicMedia && (request.method === "GET" || request.method === "HEAD")) {
      const key = cinematicMedia[1];
      const requestedRange = request.headers.has("range");
      const stored = request.method === "HEAD"
        ? await env.CINEMATIC_MEDIA.head(key)
        : await env.CINEMATIC_MEDIA.get(key, { range: request.headers });
      if (!stored) return new Response("Cinematic media not found", { status: 404 });

      const responseHeaders = new Headers();
      stored.writeHttpMetadata(responseHeaders);
      responseHeaders.set("etag", stored.httpEtag);
      responseHeaders.set("accept-ranges", "bytes");
      responseHeaders.set("cache-control", "public, max-age=31536000, immutable");
      responseHeaders.set("x-content-type-options", "nosniff");

      if (requestMatchesEtag(request, stored.httpEtag)) {
        return new Response(null, { status: 304, headers: responseHeaders });
      }

      const rangedObject = stored as R2Object & { range?: { offset: number; length: number } };
      if (requestedRange && rangedObject.range) {
        const { offset, length } = rangedObject.range;
        responseHeaders.set("content-range", `bytes ${offset}-${offset + length - 1}/${stored.size}`);
      }

      const status = requestedRange && rangedObject.range ? 206 : 200;
      const body = request.method === "HEAD" ? null : (stored as R2ObjectBody).body;
      return new Response(body, { status, headers: responseHeaders });
    }

    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;

export default worker;
