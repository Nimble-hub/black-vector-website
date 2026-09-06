import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRedirect, allowedSocketOrigin, limitApiBody, secureResponse } from "../worker/security.ts";

test("canonical HTTPS redirect preserves paths and queries, never trusts another host", () => {
  for (const source of ["http://blackvector.win", "http://www.blackvector.win", "https://www.blackvector.win"]) {
    const response = canonicalRedirect(new Request(`${source}/community?thread=abc`));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://blackvector.win/community?thread=abc");
  }
  for (const source of ["https://blackvector.win", "http://localhost:3000", "https://blackvector.win.evil.test"]) {
    assert.equal(canonicalRedirect(new Request(source)), null);
  }
});

test("WebSocket handshakes reject absent, foreign, and lookalike origins", () => {
  for (const origin of [null, "null", "https://evil.test", "https://blackvector.win.evil.test", "http://blackvector.win"]) {
    assert.equal(allowedSocketOrigin(new Request("https://blackvector.win/api/community/chat/general/socket", { headers: origin ? { origin } : {} })), false);
  }
  assert.equal(allowedSocketOrigin(new Request("https://blackvector.win/api/community/chat/general/socket", { headers: { origin: "https://blackvector.win" } })), true);
});

test("security policy retains streamed bodies, range metadata, cookies, and cache policy", async () => {
  const original = new Response("part of video", { status: 206, headers: {
    "Content-Range": "bytes 0-12/100", "Cache-Control": "public, max-age=31536000, immutable", "ETag": '"media-v1"',
  } });
  const protectedResponse = secureResponse(new Request("https://blackvector.win/media/cinematic/hyperspace/v1/a.mp4"), original);
  assert.equal(protectedResponse.status, 206);
  assert.equal(protectedResponse.headers.get("Content-Range"), "bytes 0-12/100");
  assert.equal(protectedResponse.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(protectedResponse.headers.get("ETag"), '"media-v1"');
  assert.equal(protectedResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(protectedResponse.headers.get("X-Frame-Options"), "DENY");
  assert.match(protectedResponse.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(await protectedResponse.text(), "part of video");

  const headers = new Headers();
  headers.append("Set-Cookie", "session=a; Secure; HttpOnly");
  headers.append("Set-Cookie", "csrf=b; Secure; HttpOnly");
  const account = secureResponse(new Request("https://blackvector.win/account"), new Response("profile", { headers }));
  assert.equal(account.headers.get("Cache-Control"), "private, no-store");
  assert.equal(account.headers.getSetCookie().length, 2);
});

test("local development does not set HSTS; upgrades retain their websocket object", () => {
  assert.equal(secureResponse(new Request("http://localhost:3000/"), new Response()).headers.has("Strict-Transport-Security"), false);
  const upgrade = { status: 101, webSocket: {} };
  assert.equal(secureResponse(new Request("https://blackvector.win/"), upgrade), upgrade);
});

test("API body limits reject declared and chunked oversized uploads", async () => {
  const large = new Request("https://blackvector.win/api/account/avatar", { method: "POST", body: "12345", headers: { "Content-Length": "5" } });
  assert.equal((await limitApiBody(large, 4)).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode("123")); },
    cancel() { cancelled = true; },
  });
  const chunked = new Request("https://blackvector.win/api/account/avatar", { method: "POST", body: stream, duplex: "half" });
  assert.equal((await limitApiBody(chunked, 4)).status, 413);
  assert.equal(cancelled, true);
});

test("bounded bodies preserve exact bytes and headers for auth and signed webhooks", async () => {
  const raw = ' {"event": "example", "value": "é"}\n';
  const request = new Request("https://blackvector.win/api/support/webhook", { method: "POST", body: raw, headers: { "stripe-signature": "example", "Content-Type": "application/json" } });
  const bounded = await limitApiBody(request);
  assert.ok(bounded instanceof Request);
  assert.equal(await bounded.text(), raw);
  assert.equal(bounded.headers.get("stripe-signature"), "example");
});
