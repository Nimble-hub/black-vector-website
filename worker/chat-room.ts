import { DurableObject } from "cloudflare:workers";
import type { CommunityChatMessage } from "../lib/community";

interface PublishInput {
  channel: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  content: string;
}

interface MutationInput {
  id: string;
  actorUserId: string;
  canModerate: boolean;
  content?: string;
}

interface AvatarInput {
  userId: string;
  avatarUrl: string | null;
}

interface MessageRow extends Record<string, string | number | null> {
  id: string;
  channel: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  created_at: number;
  updated_at: number | null;
}

interface ProfileRow {
  id: string;
  name: string;
  image: string | null;
}

function toMessage(row: MessageRow): CommunityChatMessage {
  return {
    id: row.id,
    channel: row.channel,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function responseStatus(error: string) {
  if (error === "MESSAGE_NOT_FOUND") return 404;
  if (error === "FORBIDDEN") return 403;
  if (error === "RATE_LIMITED") return 429;
  return 400;
}

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          avatar_url TEXT,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at);
      `);
      const columns = [
        ...this.ctx.storage.sql.exec<{ name: string }>(
          "PRAGMA table_info(messages)",
        ),
      ];
      if (!columns.some((column) => column.name === "updated_at")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE messages ADD COLUMN updated_at INTEGER",
        );
      }
    });
  }

  private broadcast(payload: object) {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(encoded);
      } catch {
        socket.close(1011, "Transmission interrupted");
      }
    }
  }

  private findMessage(id: string) {
    return [
      ...this.ctx.storage.sql.exec<MessageRow>(
        `
      SELECT id, channel, user_id, display_name, avatar_url, content, created_at, updated_at
      FROM messages WHERE id = ? LIMIT 1
    `,
        id,
      ),
    ][0];
  }

  private async refreshProfiles(): Promise<void> {
    const userIds = [
      ...this.ctx.storage.sql.exec<{ user_id: string }>(
        "SELECT DISTINCT user_id FROM messages",
      ),
    ].map((row) => row.user_id);
    if (!userIds.length) return;

    const placeholders = userIds.map(() => "?").join(", ");
    const profiles = await this.env.DB.prepare(
      `SELECT id, name, image FROM user WHERE id IN (${placeholders})`,
    )
      .bind(...userIds)
      .all<ProfileRow>();
    for (const profile of profiles.results) {
      this.ctx.storage.sql.exec(
        "UPDATE messages SET display_name = ?, avatar_url = ? WHERE user_id = ?",
        profile.name,
        profile.image,
        profile.id,
      );
    }
  }

  getRecent(limit = 80): CommunityChatMessage[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = [
      ...this.ctx.storage.sql.exec<MessageRow>(
        `
      SELECT id, channel, user_id, display_name, avatar_url, content, created_at, updated_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT ?
    `,
        safeLimit,
      ),
    ];
    return rows.reverse().map(toMessage);
  }

  publish(input: PublishInput): CommunityChatMessage {
    const content = input.content.trim();
    const displayName = input.displayName.trim().slice(0, 48) || "UNIDENTIFIED";
    if (!content || content.length > 500) throw new Error("INVALID_MESSAGE");

    const now = Date.now();
    const recent = [
      ...this.ctx.storage.sql.exec<{ created_at: number }>(
        `
      SELECT created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    `,
        input.userId,
      ),
    ];
    if (recent[0] && now - recent[0].created_at < 1500)
      throw new Error("RATE_LIMITED");

    const message: CommunityChatMessage = {
      id: crypto.randomUUID(),
      channel: input.channel,
      userId: input.userId,
      displayName,
      avatarUrl: input.avatarUrl,
      content,
      createdAt: now,
      updatedAt: null,
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, channel, user_id, display_name, avatar_url, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      message.id,
      message.channel,
      message.userId,
      message.displayName,
      message.avatarUrl,
      message.content,
      message.createdAt,
    );
    this.ctx.storage.sql.exec(`
      DELETE FROM messages WHERE id IN (
        SELECT id FROM messages ORDER BY created_at DESC LIMIT -1 OFFSET 250
      )
    `);

    this.broadcast({ type: "message", message });
    return message;
  }

  edit(input: MutationInput): CommunityChatMessage {
    const existing = this.findMessage(input.id);
    if (!existing) throw new Error("MESSAGE_NOT_FOUND");
    if (existing.user_id !== input.actorUserId) throw new Error("FORBIDDEN");
    const content = input.content?.trim() ?? "";
    if (!content || content.length > 500) throw new Error("INVALID_MESSAGE");

    const updatedAt = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE messages SET content = ?, updated_at = ? WHERE id = ?",
      content,
      updatedAt,
      input.id,
    );
    const message = toMessage({ ...existing, content, updated_at: updatedAt });
    this.broadcast({ type: "message-updated", message });
    return message;
  }

  remove(input: MutationInput): string {
    const existing = this.findMessage(input.id);
    if (!existing) throw new Error("MESSAGE_NOT_FOUND");
    if (existing.user_id !== input.actorUserId && !input.canModerate)
      throw new Error("FORBIDDEN");
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE id = ?", input.id);
    this.broadcast({ type: "message-deleted", id: input.id });
    return input.id;
  }

  updateAvatar(input: AvatarInput): void {
    this.ctx.storage.sql.exec(
      "UPDATE messages SET avatar_url = ? WHERE user_id = ?",
      input.avatarUrl,
      input.userId,
    );
    this.broadcast({
      type: "avatar-updated",
      userId: input.userId,
      avatarUrl: input.avatarUrl,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/publish") {
      const input = await request.json<PublishInput>();
      try {
        return Response.json({ message: this.publish(input) });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "INVALID_MESSAGE";
        return Response.json(
          { error: message },
          { status: responseStatus(message) },
        );
      }
    }

    if (request.method === "PATCH" && url.pathname === "/message") {
      const input = await request.json<MutationInput>();
      try {
        return Response.json({ message: this.edit(input) });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "INVALID_MESSAGE";
        return Response.json(
          { error: message },
          { status: responseStatus(message) },
        );
      }
    }

    if (request.method === "DELETE" && url.pathname === "/message") {
      const input = await request.json<MutationInput>();
      try {
        return Response.json({ deletedId: this.remove(input) });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "INVALID_MESSAGE";
        return Response.json(
          { error: message },
          { status: responseStatus(message) },
        );
      }
    }

    if (request.method === "PATCH" && url.pathname === "/avatar") {
      const input = await request.json<AvatarInput>();
      this.updateAvatar(input);
      return Response.json({ updated: true });
    }

    if (request.method === "GET" && url.pathname === "/recent") {
      await this.refreshProfiles();
      return Response.json({ messages: this.getRecent() });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    await this.refreshProfiles();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(
      JSON.stringify({ type: "snapshot", messages: this.getRecent() }),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    // The production runtime answers this through setWebSocketAutoResponse
    // without waking a hibernating room. Keep the explicit response for local
    // runtimes that do not implement automatic WebSocket responses.
    if (message === "ping") {
      socket.send("pong");
      return;
    }
    socket.send(
      JSON.stringify({
        type: "error",
        error: "Transmit through the authenticated uplink.",
      }),
    );
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, "Transmission interrupted");
  }
}
