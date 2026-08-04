export const CHAT_CHANNELS = [
  { id: "general", label: "GENERAL", description: "Fleet-wide conversation" },
  {
    id: "fleet-tactics",
    label: "FLEET TACTICS",
    description: "Strategy, doctrine, and command",
  },
  {
    id: "lore",
    label: "LORE & WORLDS",
    description: "The Black Vector universe",
  },
  {
    id: "playtest-ops",
    label: "PLAYTEST OPS",
    description: "Build discussion and coordination",
  },
] as const;

export const FORUM_CATEGORIES = [
  {
    id: "feedback",
    label: "FEEDBACK",
    description: "Tell us how the current experience feels.",
  },
  {
    id: "suggestions",
    label: "SUGGESTIONS",
    description: "Pitch systems, refinements, and new ideas.",
  },
  {
    id: "bug-reports",
    label: "BUG REPORTS",
    description: "Document defects so the team can reproduce them.",
  },
] as const;

export type ChatChannelId = (typeof CHAT_CHANNELS)[number]["id"];
export type ForumCategoryId = (typeof FORUM_CATEGORIES)[number]["id"];
export type CommunityRole = "member" | "moderator" | "admin";

export function isChatChannel(value: string): value is ChatChannelId {
  return CHAT_CHANNELS.some((channel) => channel.id === value);
}

export function isForumCategory(value: string): value is ForumCategoryId {
  return FORUM_CATEGORIES.some((category) => category.id === value);
}

export interface CommunityChatMessage {
  id: string;
  channel: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  content: string;
  createdAt: number;
  updatedAt: number | null;
  replyTo: {
    id: string;
    userId: string;
    displayName: string;
    content: string;
  } | null;
}

export type CommunityNotificationType =
  | "reply"
  | "mention"
  | "direct-message"
  | "friend-request"
  | "friend-accepted"
  | "forum-reply"
  | "clan-reply";

export interface CommunityNotification {
  id: string;
  type: CommunityNotificationType;
  title: string;
  body: string;
  href: string;
  actorName: string | null;
  actorImage: string | null;
  readAt: number | null;
  createdAt: number;
}
