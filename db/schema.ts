import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
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
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_account_user_id").on(table.userId),
    uniqueIndex("uidx_account_provider_identity").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
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
  strategyExperience: text("strategy_experience").default("intermediate").notNull(),
  playtestOptIn: integer("playtest_opt_in", { mode: "boolean" }).default(false).notNull(),
  developmentUpdatesOptIn: integer("development_updates_opt_in", { mode: "boolean" })
    .default(false)
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const communityStaffRole = sqliteTable(
  "community_staff_role",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["moderator", "admin"] }).notNull(),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
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
    category: text("category", { enum: ["feedback", "suggestions", "bug-reports"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["open", "resolved", "locked"] }).default("open").notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_forum_thread_category_updated").on(table.category, table.updatedAt),
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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .notNull(),
  },
  (table) => [
    index("idx_forum_post_thread_created").on(table.threadId, table.createdAt),
    index("idx_forum_post_author").on(table.authorId),
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
  thread: one(forumThread, { fields: [forumPost.threadId], references: [forumThread.id] }),
  author: one(user, { fields: [forumPost.authorId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const playtestProfileRelations = relations(playtestProfile, ({ one }) => ({
  user: one(user, { fields: [playtestProfile.userId], references: [user.id] }),
}));
