import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayNameSet: integer("display_name_set", { mode: "boolean" })
    .default(false)
    .notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(now)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull(),
  steamId: text("steam_id").unique(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_session_user_id").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_account_user_id").on(table.userId),
    uniqueIndex("uidx_account_provider_identity").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_verification_identifier").on(table.identifier)],
);

export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

export const playtestProfile = sqliteTable("playtest_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  callsign: text("callsign"),
  preferredPlatform: text("preferred_platform").default("windows").notNull(),
  strategyExperience: text("strategy_experience")
    .default("intermediate")
    .notNull(),
  playtestOptIn: integer("playtest_opt_in", { mode: "boolean" })
    .default(false)
    .notNull(),
  developmentUpdatesOptIn: integer("development_updates_opt_in", {
    mode: "boolean",
  })
    .default(false)
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(now)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const gameBuild = sqliteTable(
  "game_build",
  {
    id: text("id").primaryKey(),
    channel: text("channel", { enum: ["playtest", "release"] })
      .default("playtest")
      .notNull(),
    platform: text("platform", { enum: ["windows"] })
      .default("windows")
      .notNull(),
    version: text("version").notNull(),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    releaseNotes: text("release_notes"),
    state: text("state", { enum: ["draft", "published", "retired"] })
      .default("draft")
      .notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_game_build_distribution").on(
      table.channel,
      table.platform,
      table.state,
      table.publishedAt,
    ),
  ],
);

export const gameDownloadEntitlement = sqliteTable(
  "game_download_entitlement",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["playtest", "release"] })
      .default("playtest")
      .notNull(),
    active: integer("active", { mode: "boolean" }).default(true).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("uidx_game_download_entitlement_user_channel").on(
      table.userId,
      table.channel,
    ),
    index("idx_game_download_entitlement_access").on(
      table.userId,
      table.active,
      table.expiresAt,
    ),
  ],
);

export const communityStaffRole = sqliteTable(
  "community_staff_role",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["moderator", "admin"] }).notNull(),
    assignedBy: text("assigned_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_community_staff_role").on(table.role)],
);

export const forumThread = sqliteTable(
  "forum_thread",
  {
    id: text("id").primaryKey(),
    category: text("category", {
      enum: ["feedback", "suggestions", "bug-reports"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["open", "resolved", "locked"] })
      .default("open")
      .notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_forum_thread_category_updated").on(
      table.category,
      table.updatedAt,
    ),
    index("idx_forum_thread_author").on(table.authorId),
  ],
);

export const forumPost = sqliteTable(
  "forum_post",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => forumThread.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_forum_post_thread_created").on(table.threadId, table.createdAt),
    index("idx_forum_post_author").on(table.authorId),
  ],
);

export const communityPresence = sqliteTable(
  "community_presence",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: ["online", "dnd", "invisible"] })
      .default("online")
      .notNull(),
  },
  (table) => [index("idx_community_presence_last_seen").on(table.lastSeenAt)],
);

export const communityFriendship = sqliteTable(
  "community_friendship",
  {
    userLowId: text("user_low_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userHighId: text("user_high_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] })
      .default("pending")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userLowId, table.userHighId] }),
    index("idx_community_friendship_low_status").on(
      table.userLowId,
      table.status,
    ),
    index("idx_community_friendship_high_status").on(
      table.userHighId,
      table.status,
    ),
  ],
);

export const directConversation = sqliteTable(
  "direct_conversation",
  {
    id: text("id").primaryKey(),
    userLowId: text("user_low_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userHighId: text("user_high_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    uniqueIndex("uidx_direct_conversation_pair").on(
      table.userLowId,
      table.userHighId,
    ),
    index("idx_direct_conversation_low_updated").on(
      table.userLowId,
      table.updatedAt,
    ),
    index("idx_direct_conversation_high_updated").on(
      table.userHighId,
      table.updatedAt,
    ),
  ],
);

export const clan = sqliteTable(
  "clan",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tag: text("tag").notNull(),
    description: text("description").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    uniqueIndex("uidx_clan_name").on(table.name),
    uniqueIndex("uidx_clan_tag").on(table.tag),
    index("idx_clan_owner").on(table.ownerId),
  ],
);

export const clanMember = sqliteTable(
  "clan_member",
  {
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "officer", "member"] })
      .default("member")
      .notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clanId, table.userId] }),
    index("idx_clan_member_user").on(table.userId),
  ],
);

export const clanForumThread = sqliteTable(
  "clan_forum_thread",
  {
    id: text("id").primaryKey(),
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["open", "locked"] })
      .default("open")
      .notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_clan_forum_thread_clan_updated").on(
      table.clanId,
      table.updatedAt,
    ),
    index("idx_clan_forum_thread_author").on(table.authorId),
  ],
);

export const clanForumPost = sqliteTable(
  "clan_forum_post",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => clanForumThread.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_clan_forum_post_thread_created").on(
      table.threadId,
      table.createdAt,
    ),
    index("idx_clan_forum_post_author").on(table.authorId),
  ],
);

export const communityNotification = sqliteTable(
  "community_notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "reply",
        "mention",
        "direct-message",
        "friend-request",
        "friend-accepted",
        "forum-reply",
        "clan-reply",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_community_notification_user_created").on(
      table.userId,
      table.createdAt,
    ),
    index("idx_community_notification_user_read").on(
      table.userId,
      table.readAt,
    ),
    uniqueIndex("uidx_community_notification_system_notice")
      .on(table.userId, table.type, table.title)
      .where(sql`${table.actorId} IS NULL`),
  ],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  playtestProfile: one(playtestProfile),
  forumThreads: many(forumThread),
  forumPosts: many(forumPost),
}));

export const forumThreadRelations = relations(forumThread, ({ many, one }) => ({
  author: one(user, { fields: [forumThread.authorId], references: [user.id] }),
  posts: many(forumPost),
}));

export const forumPostRelations = relations(forumPost, ({ one }) => ({
  thread: one(forumThread, {
    fields: [forumPost.threadId],
    references: [forumThread.id],
  }),
  author: one(user, { fields: [forumPost.authorId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const playtestProfileRelations = relations(
  playtestProfile,
  ({ one }) => ({
    user: one(user, {
      fields: [playtestProfile.userId],
      references: [user.id],
    }),
  }),
);
