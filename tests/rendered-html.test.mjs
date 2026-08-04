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

test("requires a verified contact email and delivers legacy account reminders", async () => {
  const [authScreen, authConfig, continuation, account, settings, contactEmail, mergePage, mergeEmail, conversations, direct, migration] =
    await Promise.all([
      readFile(new URL("app/auth-screen.tsx", root), "utf8"),
      readFile(new URL("lib/auth.ts", root), "utf8"),
      readFile(new URL("app/auth/continue/route.ts", root), "utf8"),
      readFile(new URL("app/account/page.tsx", root), "utf8"),
      readFile(new URL("app/account/settings.tsx", root), "utf8"),
      readFile(new URL("app/api/account/contact-email/route.ts", root), "utf8"),
      readFile(new URL("app/account/merge-steam/page.tsx", root), "utf8"),
      readFile(new URL("app/api/account/contact-email/merge/route.ts", root), "utf8"),
      readFile(
        new URL("app/api/community/conversations/route.ts", root),
        "utf8",
      ),
      readFile(
        new URL("app/api/community/dm/[conversationId]/route.ts", root),
        "utf8",
      ),
      readFile(new URL("drizzle/0006_clean_nekra.sql", root), "utf8"),
    ]);

  assert.match(authScreen, /providerCallbackURL/);
  assert.match(authScreen, /verified contact email is required/i);
  assert.match(continuation, /hasVerifiedContactEmail/);
  assert.match(continuation, /ensureContactEmailReminder/);
  assert.match(account, /emailRequired/);
  assert.match(settings, /ADD AND VERIFY YOUR EMAIL/);
  assert.match(settings, /ENTER YOUR EMAIL/);
  assert.match(settings, /RESEND VERIFICATION/);
  assert.match(settings, /resendPendingEmail/);
  assert.match(settings, /authClient\.sendVerificationEmail/);
  assert.match(settings, /\/api\/account\/contact-email/);
  assert.match(settings, /accepted by the mail provider/i);
  assert.match(settings, /secure approval link/i);
  assert.match(contactEmail, /createEmailVerificationToken/);
  assert.match(contactEmail, /change-email-verification/);
  assert.match(contactEmail, /RATE_LIMIT = 3/);
  assert.match(contactEmail, /sendAuthEmail/);
  assert.match(contactEmail, /requiresMerge: true/);
  assert.match(contactEmail, /APPROVE STEAM CONNECTION/);
  assert.match(contactEmail, /\/account\/merge-steam/);
  assert.match(mergePage, /method="post"/);
  assert.match(mergePage, /Only approve this request/);
  assert.match(mergeEmail, /constantTimeEqual/);
  assert.match(mergeEmail, /d1\.batch/);
  assert.match(mergeEmail, /UPDATE account SET user_id/);
  assert.match(mergeEmail, /export async function POST/);
  assert.doesNotMatch(mergeEmail, /export async function GET/);
  assert.match(mergeEmail, /better-auth\.\$\{name\}/);
  assert.match(authConfig, /disableImplicitSignUp: true/);
  assert.match(authScreen, /requestSignUp: mode === "register"/);
  assert.match(conversations, /EMAIL_REQUIRED_CONVERSATION_ID/);
  assert.match(direct, /Black Vector Command/);
  assert.match(migration, /uidx_community_notification_system_notice/);
  assert.match(migration, /Contact email required/);
  assert.match(migration, /LIKE '%\.invalid'/);
});

test("keeps provider real names out of the public community identity", async () => {
  const [auth, authScreen, continuation, account, community, schema, migration, callsignMigration, displayNames, room] =
    await Promise.all([
      readFile(new URL("lib/auth.ts", root), "utf8"),
      readFile(new URL("app/auth-screen.tsx", root), "utf8"),
      readFile(new URL("app/auth/continue/route.ts", root), "utf8"),
      readFile(new URL("app/account/settings.tsx", root), "utf8"),
      readFile(new URL("app/community/community-console.tsx", root), "utf8"),
      readFile(new URL("db/schema.ts", root), "utf8"),
      readFile(new URL("drizzle/0007_sticky_masque.sql", root), "utf8"),
      readFile(new URL("drizzle/0008_neutral_callsigns.sql", root), "utf8"),
      readFile(new URL("lib/display-name.ts", root), "utf8"),
      readFile(new URL("worker/chat-room.ts", root), "utf8"),
    ]);

  assert.match(schema, /displayNameSet/);
  assert.match(auth, /createDefaultDisplayName/);
  assert.match(auth, /displayNameSet:\s*true/);
  assert.match(authScreen, /displayNameSet:\s*true/);
  assert.match(account, /CHOOSE YOUR DISPLAY NAME/);
  assert.match(community, /PUBLIC IDENTITY \/\/ PRIVACY CHECK/);
  assert.match(community, /SET DISPLAY NAME/);
  assert.match(continuation, /display_name_set/);
  assert.match(continuation, /account\.searchParams\.set\("display", "required"\)/);
  assert.match(displayNames, /CALLSIGN_PREFIXES/);
  assert.match(displayNames, /CALLSIGN_NAMES/);
  assert.match(displayNames, /crypto\.getRandomValues/);
  assert.match(migration, /'Vector-' \|\| upper/);
  assert.match(migration, /'credential', 'discord', 'steam'/);
  assert.match(callsignMigration, /WHERE `display_name_set` = false/);
  assert.match(callsignMigration, /Kestrel/);
  assert.match(room, /refreshProfiles/);
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

test("ships the realtime community hub and account profile media controls", async () => {
  const [
    community,
    communityData,
    room,
    schema,
    avatar,
    audio,
    worker,
    config,
  ] = await Promise.all([
    readFile(new URL("app/community/community-console.tsx", root), "utf8"),
    readFile(new URL("lib/community.ts", root), "utf8"),
    readFile(new URL("worker/chat-room.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/account/avatar/route.ts", root), "utf8"),
    readFile(new URL("app/hyperspace-audio.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("wrangler.jsonc", root), "utf8"),
  ]);

  assert.match(community, /LIVE COMMS/);
  assert.match(community, /FORUM ARCHIVE/);
  assert.match(communityData, /BUG REPORTS/);
  assert.match(room, /acceptWebSocket/);
  assert.match(room, /RATE_LIMITED/);
  assert.match(schema, /forumThread/);
  assert.match(schema, /forumPost/);
  assert.match(avatar, /MAX_AVATAR_BYTES/);
  assert.match(avatar, /PROFILE_MEDIA/);
  assert.match(avatar, /syncCommunityAvatars/);
  assert.match(avatar, /direct_conversation/);
  assert.match(avatar, /clan_member/);
  assert.match(audio, /PLAYBACK_GAIN = 0\.72/);
  assert.match(worker, /profileImage/);
  assert.match(config, /community-v1/);
  assert.match(config, /PROFILE_MEDIA/);

  await Promise.all([
    access(new URL("app/community/page.tsx", root)),
    access(new URL("app/api/community/forum/route.ts", root)),
    access(new URL("app/api/community/chat/[channel]/route.ts", root)),
    access(new URL("drizzle/0001_woozy_swarm.sql", root)),
  ]);
});

test("enforces community ownership and staff moderation roles", async () => {
  const [
    schema,
    permissions,
    chatRoom,
    chatRoute,
    forumRoute,
    staffRoute,
    community,
    migration,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("lib/community-permissions.ts", root), "utf8"),
    readFile(new URL("worker/chat-room.ts", root), "utf8"),
    readFile(
      new URL("app/api/community/chat/[channel]/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/community/forum/[threadId]/route.ts", root),
      "utf8",
    ),
    readFile(new URL("app/api/community/staff/route.ts", root), "utf8"),
    readFile(new URL("app/community/community-console.tsx", root), "utf8"),
    readFile(new URL("drizzle/0002_broad_the_renegades.sql", root), "utf8"),
  ]);

  assert.match(schema, /communityStaffRole/);
  assert.match(schema, /"moderator", "admin"/);
  assert.match(permissions, /canModerate/);
  assert.match(chatRoom, /message-updated/);
  assert.match(chatRoom, /message-deleted/);
  assert.match(chatRoom, /existing\.user_id !== input\.actorUserId/);
  assert.match(chatRoute, /export async function PATCH/);
  assert.match(chatRoute, /export async function DELETE/);
  assert.match(forumRoute, /Only the author can edit this thread/);
  assert.match(forumRoute, /Moderator access required/);
  assert.match(staffRoute, /Administrator access required/);
  assert.match(staffRoute, /final administrator/);
  assert.match(staffRoute, /orderBy\(desc\(user\.createdAt\)\)/);
  assert.match(staffRoute, /limit\(80\)/);
  assert.match(community, /STAFF CONTROL/);
  assert.match(community, /EDIT THREAD/);
  assert.match(community, /CONFIRM DELETE/);
  assert.match(migration, /CREATE TABLE `community_staff_role`/);
  assert.match(migration, /PRAGMA optimize/);
});

test("presents the production game pitch and cleanly hands transit audio to the site", async () => {
  const [home, layout, intro, audio, styles, header] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/hyperspace-intro.tsx", root), "utf8"),
    readFile(new URL("app/hyperspace-audio.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/site-header.tsx", root), "utf8"),
  ]);

  assert.match(home, /large-scale space RTS/);
  assert.match(home, /Build the war machine/);
  assert.match(home, /Control the system/);
  assert.doesNotMatch(home, /Fight the delay/);
  assert.doesNotMatch(home, /LIVE THEATER|PROCEDURAL 3D/);
  assert.match(layout, /https:\/\/blackvector\.win/);
  assert.match(intro, /audioRef\.current\?\.finishTransit\(audioFadeSeconds\)/);
  assert.match(intro, /void audio\.startMusic\(\)/);
  assert.match(intro, /SKIP HYPERSPACE/);
  assert.match(intro, /CONTINUE SILENT/);
  assert.match(intro, /SELECT AUDIO BEFORE TRANSIT/);
  assert.match(intro, /className=\{mobileVisitor \? "cinema-gate-primary" : undefined\}/);
  assert.match(intro, /const skipIntro = useCallback/);
  assert.match(audio, /playbackEpoch/);
  assert.match(audio, /finishTransit/);
  assert.doesNotMatch(audio, /if \(muted\) \{\s*this\.stop/);
  assert.match(audio, /this\.updateMasterGain\(\)/);
  assert.match(intro, /void audioRef\.current\?\.start\(\)/);
  assert.doesNotMatch(intro, /if \(!muted\) void audio\.startMusic\(\)/);
  assert.match(styles, /\.site-header\s*\{[\s\S]*position:\s*fixed/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /SKIP TO GAME OVERVIEW/);
  assert.match(header, /COMMUNITY/);
  assert.match(header, /ACCOUNT/);
});

test("uses the complete game fleet with lightweight procedural ship finish", async () => {
  const [home, intro] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/hyperspace-intro.tsx", root), "utf8"),
  ]);

  for (const model of [
    "Carrier.glb",
    "Cruiser.glb",
    "Fighter.glb",
    "Patrol-Cutter.glb",
    "Recon.glb",
  ]) {
    assert.match(home, new RegExp(model.replace(".", "\\.")));
    assert.match(intro, new RegExp(model.replace(".", "\\.")));
    await access(new URL(`public/models/${model}`, root));
  }
  assert.match(intro, /applyProceduralShipPaint/);
  assert.match(intro, /vertexColors:\s*true/);
  assert.match(intro, /createShipLights/);
  assert.match(intro, /THREE\.PointsMaterial/);
});

test("ships authenticated social connections, direct comms, and clan operations", async () => {
  const [
    schema,
    members,
    friends,
    conversations,
    direct,
    clans,
    clanChat,
    clanForum,
    consoleUi,
    memberUi,
    clanUi,
    migration,
    chatRoom,
    chatInput,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/community/members/route.ts", root), "utf8"),
    readFile(new URL("app/api/community/friends/route.ts", root), "utf8"),
    readFile(new URL("app/api/community/conversations/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/community/dm/[conversationId]/route.ts", root),
      "utf8",
    ),
    readFile(new URL("app/api/community/clans/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/community/clans/[clanId]/chat/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/community/clans/[clanId]/forum/route.ts", root),
      "utf8",
    ),
    readFile(new URL("app/community/community-console.tsx", root), "utf8"),
    readFile(
      new URL("app/community/community-members-panel.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/community/clan-console.tsx", root), "utf8"),
    readFile(new URL("drizzle/0003_pretty_gabe_jones.sql", root), "utf8"),
    readFile(new URL("worker/chat-room.ts", root), "utf8"),
    readFile(new URL("lib/chat-input.ts", root), "utf8"),
  ]);

  assert.match(schema, /communityPresence/);
  assert.match(schema, /\["online", "dnd", "invisible"\]/);
  assert.match(schema, /communityFriendship/);
  assert.match(schema, /directConversation/);
  assert.match(schema, /clanForumThread/);
  assert.match(members, /getCommunitySession/);
  assert.match(members, /export async function DELETE/);
  assert.match(members, /export async function PATCH/);
  assert.match(members, /presence_status !== "invisible"/);
  assert.match(members, /COMMUNITY_ONLINE_WINDOW_MS/);
  assert.doesNotMatch(members, /WHERE u\.id != \?/);
  assert.match(members, /isSelf: member\.id === session\.user\.id/);
  assert.match(friends, /orderedPair/);
  assert.match(friends, /already sent you a request\. Accept it from Friends/);
  assert.doesNotMatch(
    friends,
    /existing\?\.requested_by_id === parsed\.data\.targetUserId\) \{[\s\S]*status = 'accepted'/,
  );
  assert.match(
    conversations,
    /uidx_direct_conversation_pair|direct_conversation/,
  );
  assert.match(direct, /requireConversationMembership/);
  assert.match(clans, /requireClanMembership/);
  assert.match(clanChat, /getByName\(`clan:/);
  assert.match(clanForum, /Clan access required/);
  assert.match(consoleUi, /CLAN NETWORK/);
  assert.match(memberUi, /ONLINE/);
  assert.match(memberUi, /social\.selfBadge/);
  assert.match(memberUi, /MEMBERS/);
  assert.match(memberUi, /OFFLINE CREW/);
  assert.match(memberUi, /totalMembers/);
  assert.match(memberUi, /DIRECT COMMS \/\/ OFFLINE DELIVERY/);
  assert.match(memberUi, /FIND CREW TO ADD/);
  assert.match(memberUi, /START DIRECT COMMS/);
  assert.match(memberUi, /NO MATCHING CREW FOUND/);
  assert.match(memberUi, /Friend request sent\. Waiting for acceptance/);
  assert.match(memberUi, /pagehide/);
  assert.match(consoleUi, /DO NOT DISTURB/);
  assert.match(consoleUi, /INVISIBLE/);
  assert.match(memberUi, /DIRECT/);
  assert.match(clanUi, /OPERATIONS BOARD/);
  assert.match(migration, /CREATE TABLE `community_friendship`/);
  assert.match(migration, /CREATE TABLE `direct_conversation`/);
  assert.match(migration, /CREATE TABLE `clan`/);
  assert.match(chatRoom, /setWebSocketAutoResponse/);
  assert.match(consoleUi, /Heartbeat timed out/);
  assert.match(consoleUi, /socket !== candidate/);
  assert.match(chatInput, /event\.preventDefault\(\);\s*return true/);
  assert.match(
    consoleUi,
    /if \(submitChatOnEnter\(event\)\) void transmit\(\)/,
  );
  assert.match(memberUi, /if \(submitChatOnEnter\(event\)\) void transmit\(\)/);
  assert.match(clanUi, /if \(submitChatOnEnter\(event\)\) void transmit\(\)/);
  assert.match(chatRoom, /type: "avatar-updated"/);
  assert.match(chatRoom, /refreshProfiles/);
  assert.match(chatRoom, /SELECT id, name, image FROM user/);
});

test("ships durable replies, member mentions, and an account notification inbox", async () => {
  const [schema, chatRoom, chatRoute, notifications, notificationUi, consoleUi, migration] =
    await Promise.all([
      readFile(new URL("db/schema.ts", root), "utf8"),
      readFile(new URL("worker/chat-room.ts", root), "utf8"),
      readFile(
        new URL("app/api/community/chat/[channel]/route.ts", root),
        "utf8",
      ),
      readFile(
        new URL("app/api/community/notifications/route.ts", root),
        "utf8",
      ),
      readFile(
        new URL("app/community/community-notifications.tsx", root),
        "utf8",
      ),
      readFile(new URL("app/community/community-console.tsx", root), "utf8"),
      readFile(
        new URL("drizzle/0005_jazzy_mikhail_rasputin.sql", root),
        "utf8",
      ),
    ]);

  assert.match(schema, /communityNotification/);
  assert.match(chatRoom, /reply_to_id/);
  assert.match(chatRoom, /replyToId/);
  assert.match(notifications, /export async function GET/);
  assert.match(notifications, /read-all/);
  assert.match(notificationUi, /10_000/);
  assert.match(notificationUi, /MARK ALL READ/);
  assert.match(consoleUi, /REPLYING TO/);
  assert.match(consoleUi, /replyToId/);
  assert.match(consoleUi, /mentionSuggestions/);
  assert.match(consoleUi, /mentionUserIds/);
  assert.match(chatRoute, /type: "mention"/);
  assert.match(chatRoute, /mentioned you in/);
  assert.match(migration, /CREATE TABLE `community_notification`/);
});

test("resolves the hyperspace camera, FOV, and interface on one handoff curve", async () => {
  const [intro, timeline, styles] = await Promise.all([
    readFile(new URL("app/hyperspace-intro.tsx", root), "utf8"),
    readFile(new URL("app/hyperspace-timeline.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(timeline, /HYPERSPACE_SOURCE_DURATION_MS = 16_500/);
  assert.match(timeline, /HYPERSPACE_DURATION_MS = 11_500/);
  assert.match(timeline, /CRUISE_COMPRESSION_START_MS = 7_000/);
  assert.match(timeline, /EXIT_SEQUENCE_START_MS = HYPERSPACE_SOURCE_DURATION_MS \* 0\.84/);
  assert.match(intro, /const handoffBlend = smoothstep/);
  assert.match(intro, /camera\.position\.set\([\s\S]*handoffBlend/);
  assert.match(
    intro,
    /camera\.fov = THREE\.MathUtils\.lerp\(hyperspaceFov, 64, handoffBlend\)/,
  );
  assert.match(
    intro,
    /world\.interfaceAnchor\.position\.lerpVectors\(\s*interfaceFar,\s*interfaceNear,\s*handoffBlend,?\s*\)/,
  );
  assert.match(intro, /const EXIT_SETTLE_DURATION = 3000/);
  assert.match(intro, /landingElapsed >= EXIT_SETTLE_DURATION/);
  assert.match(intro, /finish\(0\.7\)/);
  assert.match(intro, /hyperspace-scroll-lock/);
  assert.match(styles, /html\.hyperspace-scroll-lock/);
  assert.match(
    styles,
    /\.experience-arriving \.space-experience\.is-jumping\s*\{\s*z-index:\s*0/,
  );
});

test("exposes a persistent cinematic master volume beside the audio toggle", async () => {
  const [audio, intro, header, polish] = await Promise.all([
    readFile(new URL("app/hyperspace-audio.ts", root), "utf8"),
    readFile(new URL("app/hyperspace-intro.tsx", root), "utf8"),
    readFile(new URL("app/site-header.tsx", root), "utf8"),
    readFile(new URL("app/polish.css", root), "utf8"),
  ]);

  assert.match(audio, /setVolume\(volume: number\)/);
  assert.match(audio, /function volumeToGain\(volume: number\)/);
  assert.match(audio, /VOLUME_CURVE_ANCHOR \* volumeToGain|PLAYBACK_GAIN \* volumeToGain/);
  assert.match(audio, /const JUMP_FADE_IN_SECONDS = 1/);
  assert.match(audio, /linearRampToValueAtTime\(1, start \+ JUMP_FADE_IN_SECONDS\)/);
  assert.match(intro, /black-vector-audio-volume/);
  assert.match(intro, /AUDIO_VOLUME_KEY\) \?\? "0\.3"/);
  assert.match(intro, /Hyperspace audio controls/);
  assert.match(intro, /querySelectorAll<HTMLButtonElement>/);
  assert.match(intro, /querySelectorAll<HTMLInputElement>/);
  assert.match(intro, /AUDIO_SYNC_EVENT/);
  assert.match(header, /defaultValue="30"/);
  assert.match(header, /step="1"/);
  assert.match(
    intro,
    /control\.addEventListener\("input", changeVolume\)/,
  );
  assert.match(header, /data-audio-volume/);
  assert.match(header, /Cinematic audio volume/);
  assert.match(polish, /\.audio-volume-control/);
});

test("keeps the cinematic and Worker runtime production-clean", async () => {
  const [intro, worker, members, eslintConfig, wranglerConfig] =
    await Promise.all([
      readFile(new URL("app/hyperspace-intro.tsx", root), "utf8"),
      readFile(new URL("worker/index.ts", root), "utf8"),
      readFile(
        new URL("app/community/community-members-panel.tsx", root),
        "utf8",
      ),
      readFile(new URL("eslint.config.mjs", root), "utf8"),
      readFile(new URL("wrangler.jsonc", root), "utf8"),
    ]);

  assert.doesNotMatch(members, /Â|Ã|â|�/);
  assert.match(intro, /const releaseResources = \(\) =>/);
  assert.match(intro, /if \(resourcesReleased\) return/);
  assert.match(intro, /visibilitychange/);
  assert.doesNotMatch(worker, /handleImageOptimization|interface Env|interface ExecutionContext/);
  assert.match(worker, /satisfies ExportedHandler<WorkerEnv>/);
  assert.match(worker, /if-none-match/);
  assert.match(eslintConfig, /worker-configuration\.d\.ts/);
  assert.match(wranglerConfig, /"traces"/);
  assert.match(wranglerConfig, /"head_sampling_rate": 0\.05/);
});
