import { DurableObject } from "cloudflare:workers";
import type { ChatChannelId, CommunityChatMessage } from "../lib/community";

interface PublishInput {
  channel: ChatChannelId;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  content: string;
}

interface MessageRow extends Record<string, string | number | null> {
  id: string;
  channel: ChatChannelId;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  created_at: number;
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
  };
}

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
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
  }

  getRecent(limit = 80): CommunityChatMessage[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = [...this.ctx.storage.sql.exec<MessageRow>(`
      SELECT id, channel, user_id, display_name, avatar_url, content, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT ?
    `, safeLimit)];
    return rows.reverse().map(toMessage);
  }

  publish(input: PublishInput): CommunityChatMessage {
    const content = input.content.trim();
    const displayName = input.displayName.trim().slice(0, 48) || "UNIDENTIFIED";
    if (!content || content.length > 500) throw new Error("INVALID_MESSAGE");

    const now = Date.now();
    const recent = [...this.ctx.storage.sql.exec<{ created_at: number }>(`
      SELECT created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    `, input.userId)];
    if (recent[0] && now - recent[0].created_at < 1500) throw new Error("RATE_LIMITED");

    const message: CommunityChatMessage = {
      id: crypto.randomUUID(),
      channel: input.channel,
      userId: input.userId,
      displayName,
      avatarUrl: input.avatarUrl,
      content,
      createdAt: now,
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, channel, user_id, display_name, avatar_url, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

    const payload = JSON.stringify({ type: "message", message });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Transmission interrupted");
      }
    }
    return message;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/publish") {
      const input = await request.json<PublishInput>();
      try {
        return Response.json({ message: this.publish(input) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "INVALID_MESSAGE";
        return Response.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
      }
    }

    if (request.method === "GET" && url.pathname === "/recent") {
      return Response.json({ messages: this.getRecent() });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "snapshot", messages: this.getRecent() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket): void {
    socket.send(JSON.stringify({ type: "error", error: "Transmit through the authenticated uplink." }));
  }
}
