/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { ChatRoom } from "./chat-room";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CHAT_ROOMS: DurableObjectNamespace;
  PROFILE_MEDIA: R2Bucket;
  CINEMATIC_MEDIA: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      const stored = await env.PROFILE_MEDIA.get(key);
      if (!stored) return new Response("Profile image not found", { status: 404 });
      const responseHeaders = new Headers({
        "content-type": stored.httpMetadata?.contentType || "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      });
      responseHeaders.set("etag", stored.httpEtag);
      return new Response(request.method === "HEAD" ? null : stored.body, { headers: responseHeaders });
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

      const rangedObject = stored as R2Object & { range?: { offset: number; length: number } };
      if (requestedRange && rangedObject.range) {
        const { offset, length } = rangedObject.range;
        responseHeaders.set("content-range", `bytes ${offset}-${offset + length - 1}/${stored.size}`);
      }

      const status = requestedRange && rangedObject.range ? 206 : 200;
      const body = request.method === "HEAD" ? null : (stored as R2ObjectBody).body;
      return new Response(body, { status, headers: responseHeaders });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
