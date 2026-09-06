/** Response policy shared by HTML, API and media routes; never buffers streams. */
export function canonicalRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!["blackvector.win", "www.blackvector.win"].includes(url.hostname)) return null;
  if (url.protocol === "https:" && url.hostname === "blackvector.win") return null;
  url.protocol = "https:";
  url.hostname = "blackvector.win";
  url.port = "";
  return Response.redirect(url.toString(), 308);
}

export function allowedSocketOrigin(request: Request): boolean {
  // Browsers always supply Origin for WebSocket handshakes. Public channels
  // remain readable, but cannot be embedded as a cross-site live data feed.
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function limitApiBody(request: Request, limit = 1024 * 1024): Promise<Request | Response> {
  if (!new URL(request.url).pathname.startsWith("/api/") || !request.body) return request;
  const tooLarge = () => Response.json({ error: "Request is too large. Please reduce the upload size." }, { status: 413 });
  if (Number(request.headers.get("content-length")) > limit) return tooLarge();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ error: "Request was interrupted. Please try again." }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  // Keep the exact original bytes: Stripe validates the raw webhook body.
  return new Request(request, { body });
}

export function secureResponse(request: Request, response: Response): Response {
  if (response.status === 101) return response; // Keep the Cloudflare WebSocket intact.
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Enforce the embedding/navigation boundary without breaking the existing
  // streaming React scripts, inline Three.js styles, or official OAuth flows.
  headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  const url = new URL(request.url);
  if (["blackvector.win", "www.blackvector.win"].includes(url.hostname)) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (url.pathname.startsWith("/api/") || /^\/(account|community)(\/|$)/.test(url.pathname)) {
    headers.set("Cache-Control", "private, no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
