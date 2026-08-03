import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("packages a server runtime and D1 migration", async () => {
  const [hosting, migration, worker] = await Promise.all([
    readFile(new URL("dist/.openai/hosting.json", root), "utf8"),
    readFile(new URL("dist/.openai/drizzle/0000_lumpy_ego.sql", root), "utf8"),
    readFile(new URL("dist/server/index.js", root), "utf8"),
  ]);

  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(migration, /CREATE TABLE `user`/);
  assert.match(migration, /CREATE TABLE `account`/);
  assert.match(migration, /CREATE TABLE `playtest_profile`/);
  assert.match(migration, /uidx_account_provider_identity/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(worker, /\/api\/auth\/providers/);
});

test("keeps account linking explicit and exposes every requested sign-in path", async () => {
  const [auth, authScreen, settings, home] = await Promise.all([
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/auth-screen.tsx", root), "utf8"),
    readFile(new URL("app/account/settings.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);

  assert.match(auth, /disableImplicitLinking:\s*true/);
  assert.match(auth, /allowUnlinkingAll:\s*false/);
  assert.match(auth, /requireEmailVerification:\s*true/);
  assert.match(authScreen, /CONTINUE WITH STEAM/);
  assert.match(authScreen, /CONTINUE WITH GOOGLE/);
  assert.match(authScreen, /CONTINUE WITH DISCORD/);
  assert.match(authScreen, /OR MANUAL ACCOUNT/);
  assert.match(settings, /CONNECTED ACCOUNTS/);
  assert.match(settings, /ACTIVATE MANUAL SIGN-IN/);
  assert.match(home, /register\?returnTo=%2Faccount/);

  await Promise.all([
    access(new URL("app/api/auth/[...all]/route.ts", root)),
    access(new URL("app/api/steam/link/callback/route.ts", root)),
    access(new URL("app/api/account/profile/route.ts", root)),
  ]);
});

test("secures and exposes manual-account password recovery", async () => {
  const [auth, email, forgotPassword, resetPassword] = await Promise.all([
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("lib/auth-email.ts", root), "utf8"),
    readFile(new URL("app/forgot-password/page.tsx", root), "utf8"),
    readFile(new URL("app/reset-password/page.tsx", root), "utf8"),
  ]);

  assert.match(auth, /resetPasswordTokenExpiresIn:\s*60 \* 30/);
  assert.match(auth, /revokeSessionsOnPasswordReset:\s*true/);
  assert.match(auth, /"\/request-password-reset"/);
  assert.match(auth, /ipAddressHeaders:\s*\["cf-connecting-ip"\]/);
  assert.match(email, /text:/);
  assert.match(email, /html:/);
  assert.match(forgotPassword, /If that address has an account/);
  assert.match(forgotPassword, /window\.location\.origin/);
  assert.match(resetPassword, /INVALID_TOKEN/);
  assert.match(resetPassword, /REQUEST NEW RESET LINK/);
});

test("routes the hero playtest call-to-action by authentication state", async () => {
  const [home, playtestRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/playtest/route.ts", root), "utf8"),
  ]);

  assert.match(home, /hero-playtest-cta/);
  assert.match(home, /JOIN THE PLAYTEST/);
  assert.match(home, /id=\{option\.id\}/);
  assert.match(playtestRoute, /getSession/);
  assert.match(playtestRoute, /\/#download/);
  assert.match(playtestRoute, /\/register\?returnTo=/);
});
