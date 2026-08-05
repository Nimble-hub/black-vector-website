"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CHAT_CHANNELS,
  FORUM_CATEGORIES,
  isChatChannel,
  type ChatChannelId,
  type CommunityChatMessage,
  type CommunityRole,
  type ForumCategoryId,
} from "@/lib/community";
import styles from "./community.module.css";
import controls from "./community-controls.module.css";
import { CommunityMembersPanel } from "./community-members-panel";
import { ClanConsole } from "./clan-console";
import { submitChatOnEnter } from "@/lib/chat-input";
import { CommunityNotifications } from "./community-notifications";

interface CurrentUser {
  id: string;
  name: string;
  displayNameSet: boolean;
  role: CommunityRole;
}
interface ForumThread {
  id: string;
  category: ForumCategoryId;
  title: string;
  body: string;
  status: "open" | "resolved" | "locked";
  replyCount: number;
  createdAt: string | number;
  updatedAt: string | number;
  authorId: string;
  authorName: string;
  authorImage: string | null;
}
interface ForumReply {
  id: string;
  body: string;
  createdAt: string | number;
  updatedAt: string | number;
  authorId: string;
  authorName: string;
  authorImage: string | null;
}
interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: CommunityRole;
}
type PresenceStatus = "online" | "dnd" | "invisible";
type MentionMember = { id: string; name: string; image: string | null };

function formatTime(value: string | number) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "BV"
  );
}

function Avatar({ name, image }: { name: string; image?: string | null }) {
  return image ? (
    <Image
      src={image}
      alt=""
      width={34}
      height={34}
      unoptimized
      style={{
        display: "block",
        flex: "0 0 auto",
        width: 34,
        height: 34,
        border: "1px solid rgba(87,186,194,.35)",
        objectFit: "cover",
      }}
    />
  ) : (
    <i>{initials(name)}</i>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderMessageContent(content: string, members: MentionMember[]) {
  const names = members
    .map((member) => member.name)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!names.length) return content;
  const pattern = new RegExp(
    `(@(?:${names.map(escapeRegExp).join("|")}))(?=$|[\\s.,!?;:()\\[\\]{}])`,
    "gi",
  );
  const known = new Set(names.map((name) => `@${name.toLocaleLowerCase()}`));
  return content.split(pattern).map((part, index) =>
    known.has(part.toLocaleLowerCase()) ? (
      <mark className={styles.mention} key={`${part}-${index}`}>{part}</mark>
    ) : part,
  );
}

function RoleBadge({ role }: { role: CommunityRole }) {
  if (role === "member") return null;
  return (
    <span className={`${controls.roleBadge} ${controls[role]}`}>
      {role.toUpperCase()}
    </span>
  );
}

export function CommunityConsole({
  currentUser,
}: {
  currentUser: CurrentUser | null;
}) {
  const [mode, setMode] = useState<"chat" | "forum" | "clans" | "staff">(
    "chat",
  );
  const [channel, setChannel] = useState<ChatChannelId>("general");
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting");
  const [chatText, setChatText] = useState("");
  const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([]);
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null);
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [category, setCategory] = useState<ForumCategoryId>("feedback");
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(
    null,
  );
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [editingThread, setEditingThread] = useState(false);
  const [editingThreadTitle, setEditingThreadTitle] = useState("");
  const [editingThreadBody, setEditingThreadBody] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [activeStaffQuery, setActiveStaffQuery] = useState("");
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [presenceStatus, setPresenceStatus] =
    useState<PresenceStatus>("online");
  const feedRef = useRef<HTMLDivElement>(null);
  const isModerator =
    currentUser?.role === "moderator" || currentUser?.role === "admin";

  const mentionMatch = useMemo(
    () => chatText.match(/(?:^|\s)@([^@\n]*)$/),
    [chatText],
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch || chatText.endsWith(" ")) return [];
    const query = mentionMatch[1].trim().toLocaleLowerCase();
    return mentionMembers
      .filter((member) => member.id !== currentUser?.id)
      .filter((member) => !query || member.name.toLocaleLowerCase().includes(query))
      .slice(0, 6);
  }, [chatText, currentUser?.id, mentionMatch, mentionMembers]);

  const selectMention = useCallback((member: MentionMember) => {
    const match = chatText.match(/(?:^|\s)@([^@\n]*)$/);
    if (!match || match.index === undefined) return;
    const atIndex = match.index + match[0].lastIndexOf("@");
    setChatText(`${chatText.slice(0, atIndex)}@${member.name} `);
    setMentionUserIds((current) => [...new Set([...current, member.id])]);
  }, [chatText]);

  useEffect(() => {
    const requestedChannel = new URLSearchParams(window.location.search).get("channel");
    if (requestedChannel && isChatChannel(requestedChannel)) {
      queueMicrotask(() => setChannel(requestedChannel));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void fetch("/api/community/members", { cache: "no-store" })
      .then(async (response) => (await response.json()) as { members?: MentionMember[] })
      .then((data) => setMentionMembers(data.members ?? []));
  }, [currentUser]);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let healthy = false;
    let stopped = false;

    const clearSocketTimers = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (watchdogTimer) clearTimeout(watchdogTimer);
      heartbeatTimer = undefined;
      watchdogTimer = undefined;
    };

    const confirmHealthy = (candidate: WebSocket) => {
      if (stopped || socket !== candidate) return;
      reconnectAttempt = 0;
      healthy = true;
      setConnection("live");
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (socket === candidate) candidate.close(4000, "Heartbeat timed out");
      }, 42_000);
    };

    const scheduleReconnect = () => {
      if (stopped || !navigator.onLine || reconnectTimer) return;
      const baseDelay = Math.min(10_000, 650 * 2 ** reconnectAttempt);
      const delay = baseDelay + Math.random() * Math.min(500, baseDelay / 3);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (stopped || !navigator.onLine) {
        setConnection("offline");
        return;
      }
      if (
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      )
        return;
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const candidate = new WebSocket(
        `${protocol}//${window.location.host}/api/community/chat/${channel}/socket`,
      );
      socket = candidate;
      candidate.addEventListener("open", () => {
        if (socket !== candidate || stopped) return;
        // A successful protocol upgrade alone is not enough to call the
        // channel live. The room snapshot or heartbeat confirms end-to-end
        // application health.
        heartbeatTimer = setInterval(() => {
          if (candidate.readyState === WebSocket.OPEN) candidate.send("ping");
        }, 15_000);
        candidate.send("ping");
      });
      candidate.addEventListener("message", (event) => {
        if (socket !== candidate || stopped) return;
        if (String(event.data) === "pong") {
          confirmHealthy(candidate);
          return;
        }
        let payload:
          | { type: "snapshot"; messages: CommunityChatMessage[] }
          | {
              type: "message" | "message-updated";
              message: CommunityChatMessage;
            }
          | { type: "message-deleted"; id: string }
          | {
              type: "avatar-updated";
              userId: string;
              avatarUrl: string | null;
            };
        try {
          payload = JSON.parse(String(event.data)) as typeof payload;
        } catch {
          return;
        }
        confirmHealthy(candidate);
        if (payload.type === "snapshot") setMessages(payload.messages);
        if (payload.type === "message") {
          setMessages((current) =>
            [
              ...current.filter((item) => item.id !== payload.message.id),
              payload.message,
            ].slice(-100),
          );
        }
        if (payload.type === "message-updated") {
          setMessages((current) =>
            current.map((item) =>
              item.id === payload.message.id ? payload.message : item,
            ),
          );
        }
        if (payload.type === "message-deleted") {
          setMessages((current) =>
            current.filter((item) => item.id !== payload.id),
          );
        }
        if (payload.type === "avatar-updated") {
          setMessages((current) =>
            current.map((item) =>
              item.userId === payload.userId
                ? { ...item, avatarUrl: payload.avatarUrl }
                : item,
            ),
          );
        }
      });
      candidate.addEventListener("close", () => {
        if (socket !== candidate || stopped) return;
        socket = undefined;
        healthy = false;
        clearSocketTimers();
        setConnection("offline");
        scheduleReconnect();
      });
      candidate.addEventListener("error", () => {
        if (socket === candidate) candidate.close();
      });
    };

    const loadFallback = async () => {
      if (stopped || healthy) return;
      const response = await fetch(`/api/community/chat/${channel}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = (await response.json()) as {
        messages?: CommunityChatMessage[];
      };
      if (data.messages) setMessages(data.messages);
    };

    const handleOnline = () => {
      reconnectAttempt = 0;
      connect();
    };
    const handleOffline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      socket?.close();
      setConnection("offline");
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      else connect();
      void loadFallback();
    };

    connect();
    const fallbackTimer = setInterval(() => void loadFallback(), 7_500);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(fallbackTimer);
      clearSocketTimers();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      socket?.close();
    };
  }, [channel]);

  useEffect(() => {
    const target = window.location.hash
      ? document.getElementById(window.location.hash.slice(1))
      : null;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    else feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/community/forum?category=${category}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as { threads?: ForumThread[] };
    setThreads(data.threads ?? []);
  }, [category]);

  const loadThread = useCallback(async (threadId: string) => {
    const response = await fetch(`/api/community/forum/${threadId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      thread?: ForumThread;
      replies?: ForumReply[];
      error?: string;
    };
    if (!response.ok || !data.thread) {
      setNotice(data.error ?? "Thread could not be loaded.");
      return;
    }
    setSelectedThread(data.thread);
    setReplies(data.replies ?? []);
  }, []);

  useEffect(() => {
    let ignore = false;
    void fetch(`/api/community/forum?category=${category}`, {
      cache: "no-store",
    })
      .then(
        async (response) =>
          (await response.json()) as { threads?: ForumThread[] },
      )
      .then((data) => {
        if (!ignore) setThreads(data.threads ?? []);
      });
    return () => {
      ignore = true;
    };
  }, [category]);

  const loadStaff = useCallback(async (query = "") => {
    const response = await fetch(
      `/api/community/staff${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      users?: StaffUser[];
      error?: string;
    };
    if (!response.ok)
      return setNotice(data.error ?? "Staff records could not be loaded.");
    setStaffUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void fetch("/api/community/members", { cache: "no-store" })
      .then(
        async (response) =>
          (await response.json()) as { selfStatus?: PresenceStatus },
      )
      .then((data) => setPresenceStatus(data.selfStatus ?? "online"));
  }, [currentUser]);

  useEffect(() => {
    if (mode !== "staff" || currentUser?.role !== "admin") return;
    queueMicrotask(() => void loadStaff(activeStaffQuery));
    const timer = window.setInterval(
      () => void loadStaff(activeStaffQuery),
      15_000,
    );
    return () => window.clearInterval(timer);
  }, [activeStaffQuery, currentUser?.role, loadStaff, mode]);

  async function changePresenceStatus(status: PresenceStatus) {
    const previous = presenceStatus;
    setPresenceStatus(status);
    setBusyAction("presence");
    const response = await fetch("/api/community/members", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await response.json()) as {
      status?: PresenceStatus;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.status) {
      setPresenceStatus(previous);
      setNotice(data.error ?? "Presence status could not be changed.");
      return;
    }
    setPresenceStatus(data.status);
  }

  const activeChannel = useMemo(
    () => CHAT_CHANNELS.find((item) => item.id === channel)!,
    [channel],
  );
  const activeCategory = useMemo(
    () => FORUM_CATEGORIES.find((item) => item.id === category)!,
    [category],
  );

  async function transmit(event?: FormEvent) {
    event?.preventDefault();
    if (!chatText.trim() || !currentUser) return;
    const content = chatText.trim();
    setChatText("");
    const response = await fetch(`/api/community/chat/${channel}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        replyToId: replyingTo?.id ?? null,
        mentionUserIds,
      }),
    });
    const data = (await response.json()) as {
      message?: CommunityChatMessage;
      error?: string;
    };
    if (!response.ok) {
      setNotice(data.error ?? "Transmission failed.");
      setChatText(content);
      return;
    }
    setMentionUserIds([]);
    if (data.message) {
      setReplyingTo(null);
      setMessages((current) =>
        [
          ...current.filter((item) => item.id !== data.message!.id),
          data.message!,
        ].slice(-100),
      );
    }
  }

  async function saveMessage(messageId: string) {
    if (!editingMessageText.trim()) return;
    setBusyAction(`chat-edit:${messageId}`);
    const response = await fetch(`/api/community/chat/${channel}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: messageId, content: editingMessageText }),
    });
    const data = (await response.json()) as {
      message?: CommunityChatMessage;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.message)
      return setNotice(data.error ?? "Message could not be edited.");
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? data.message! : item)),
    );
    setEditingMessageId(null);
  }

  async function deleteMessage(messageId: string) {
    setBusyAction(`chat-delete:${messageId}`);
    const response = await fetch(`/api/community/chat/${channel}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: messageId }),
    });
    const data = (await response.json()) as { error?: string };
    setBusyAction(null);
    setConfirmDelete(null);
    if (!response.ok)
      return setNotice(data.error ?? "Message could not be deleted.");
    setMessages((current) => current.filter((item) => item.id !== messageId));
  }

  async function createThread(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/community/forum", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, title: threadTitle, body: threadBody }),
    });
    const data = (await response.json()) as {
      error?: string;
      thread?: ForumThread;
    };
    if (!response.ok || !data.thread)
      return setNotice(data.error ?? "Unable to open thread.");
    setThreadTitle("");
    setThreadBody("");
    setNewThreadOpen(false);
    await loadThreads();
    setSelectedId(data.thread.id);
    void loadThread(data.thread.id);
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    const response = await fetch(`/api/community/forum/${selectedId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: replyBody }),
    });
    const data = (await response.json()) as {
      error?: string;
      reply?: ForumReply;
    };
    if (!response.ok || !data.reply)
      return setNotice(data.error ?? "Reply failed.");
    setReplyBody("");
    setReplies((current) => [...current, data.reply!]);
    setSelectedThread((current) =>
      current ? { ...current, replyCount: current.replyCount + 1 } : current,
    );
    void loadThreads();
  }

  async function saveThread() {
    if (
      !selectedThread ||
      !editingThreadTitle.trim() ||
      !editingThreadBody.trim()
    )
      return;
    setBusyAction(`thread-edit:${selectedThread.id}`);
    const response = await fetch(`/api/community/forum/${selectedThread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "thread",
        title: editingThreadTitle,
        body: editingThreadBody,
      }),
    });
    const data = (await response.json()) as {
      thread?: Pick<ForumThread, "title" | "body" | "updatedAt">;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.thread)
      return setNotice(data.error ?? "Thread could not be edited.");
    setSelectedThread((current) =>
      current ? { ...current, ...data.thread } : current,
    );
    setEditingThread(false);
    void loadThreads();
  }

  async function deleteThread() {
    if (!selectedThread) return;
    setBusyAction(`thread-delete:${selectedThread.id}`);
    const response = await fetch(`/api/community/forum/${selectedThread.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "thread" }),
    });
    const data = (await response.json()) as { error?: string };
    setBusyAction(null);
    setConfirmDelete(null);
    if (!response.ok)
      return setNotice(data.error ?? "Thread could not be deleted.");
    setSelectedId(null);
    setSelectedThread(null);
    setReplies([]);
    void loadThreads();
  }

  async function saveReply(replyId: string) {
    if (!selectedThread || !editingReplyBody.trim()) return;
    setBusyAction(`reply-edit:${replyId}`);
    const response = await fetch(`/api/community/forum/${selectedThread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "reply", replyId, body: editingReplyBody }),
    });
    const data = (await response.json()) as {
      reply?: Pick<ForumReply, "id" | "body" | "updatedAt">;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.reply)
      return setNotice(data.error ?? "Reply could not be edited.");
    setReplies((current) =>
      current.map((item) =>
        item.id === replyId ? { ...item, ...data.reply! } : item,
      ),
    );
    setEditingReplyId(null);
  }

  async function deleteReply(replyId: string) {
    if (!selectedThread) return;
    setBusyAction(`reply-delete:${replyId}`);
    const response = await fetch(`/api/community/forum/${selectedThread.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "reply", replyId }),
    });
    const data = (await response.json()) as { error?: string };
    setBusyAction(null);
    setConfirmDelete(null);
    if (!response.ok)
      return setNotice(data.error ?? "Reply could not be deleted.");
    setReplies((current) => current.filter((item) => item.id !== replyId));
    setSelectedThread((current) =>
      current
        ? { ...current, replyCount: Math.max(0, current.replyCount - 1) }
        : current,
    );
    void loadThreads();
  }

  async function updateThreadStatus(status: ForumThread["status"]) {
    if (!selectedThread) return;
    setBusyAction(`thread-status:${selectedThread.id}`);
    const response = await fetch(`/api/community/forum/${selectedThread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "status", status }),
    });
    const data = (await response.json()) as {
      status?: ForumThread["status"];
      updatedAt?: string | number;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.status)
      return setNotice(data.error ?? "Thread status could not be changed.");
    setSelectedThread((current) =>
      current
        ? {
            ...current,
            status: data.status!,
            updatedAt: data.updatedAt ?? current.updatedAt,
          }
        : current,
    );
    void loadThreads();
  }

  async function assignRole(userId: string, role: CommunityRole) {
    setBusyAction(`staff:${userId}`);
    const response = await fetch("/api/community/staff", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = (await response.json()) as {
      user?: StaffUser;
      error?: string;
    };
    setBusyAction(null);
    if (!response.ok || !data.user)
      return setNotice(data.error ?? "Role could not be assigned.");
    setStaffUsers((current) =>
      current.map((item) => (item.id === userId ? data.user! : item)),
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/">
          <span>BV</span>
          <strong>
            BLACK VECTOR<sup className="trademark-symbol">™</sup>
          </strong>
        </Link>
        <div className={styles.title}>
          <small>PUBLIC NETWORK // COMMUNITY NODE</small>
          <b>THE UPLINK</b>
        </div>
        <nav aria-label="Community navigation">
          <CommunityNotifications enabled={Boolean(currentUser)} />
          <Link href="/">HOME</Link>
          <Link href="/playtest">PLAYTEST</Link>
          <Link href="/account">ACCOUNT</Link>
        </nav>
      </header>

      {currentUser && !currentUser.displayNameSet && (
        <section className={styles.displayNamePrompt} role="alert">
          <div>
            <small>PUBLIC IDENTITY // PRIVACY CHECK</small>
            <strong>CHOOSE THE NAME OTHER COMMANDERS WILL SEE.</strong>
            <p>
              Your account provider name is not shown here. You are currently
              using the temporary callsign <b>{currentUser.name}</b>.
            </p>
          </div>
          <Link href="/account?display=required&returnTo=%2Fcommunity">
            SET DISPLAY NAME
          </Link>
        </section>
      )}

      <section className={styles.console}>
        <aside
          className={`${styles.modeRail} ${currentUser?.role === "admin" ? controls.threeModes : ""}`}
        >
          <p>NETWORK MODES</p>
          <button
            className={mode === "chat" ? styles.active : ""}
            onClick={() => setMode("chat")}
          >
            <span>01</span>
            <b>LIVE COMMS</b>
            <small>REALTIME CHANNELS</small>
          </button>
          <button
            className={mode === "forum" ? styles.active : ""}
            onClick={() => setMode("forum")}
          >
            <span>02</span>
            <b>FORUM ARCHIVE</b>
            <small>FEEDBACK &amp; REPORTS</small>
          </button>
          <button
            className={mode === "clans" ? styles.active : ""}
            onClick={() => setMode("clans")}
          >
            <span>03</span>
            <b>CLAN NETWORK</b>
            <small>PRIVATE GROUPS &amp; OPS</small>
          </button>
          {currentUser?.role === "admin" && (
            <button
              className={mode === "staff" ? styles.active : ""}
              onClick={() => setMode("staff")}
            >
              <span>04</span>
              <b>STAFF CONTROL</b>
              <small>ROLES &amp; AUTHORITY</small>
            </button>
          )}
          <div className={styles.identity}>
            <i
              className={currentUser ? styles[presenceStatus] : styles.offline}
            >
              {currentUser ? initials(currentUser.name) : "--"}
            </i>
            <span>
              <small>IDENTITY</small>
              <b>{currentUser?.name ?? "OBSERVER"}</b>
              {currentUser ? (
                <select
                  aria-label="Presence status"
                  value={presenceStatus}
                  disabled={busyAction === "presence"}
                  onChange={(event) =>
                    void changePresenceStatus(
                      event.target.value as PresenceStatus,
                    )
                  }
                >
                  <option value="online">ONLINE</option>
                  <option value="dnd">DO NOT DISTURB</option>
                  <option value="invisible">INVISIBLE</option>
                </select>
              ) : (
                <small>OFFLINE</small>
              )}
              <RoleBadge role={currentUser?.role ?? "member"} />
            </span>
          </div>
        </aside>

        {mode === "chat" && (
          <div className={`${styles.workspace} ${styles.withMembers}`}>
            <aside className={styles.channelRail}>
              <p>COMMS CHANNELS</p>
              {CHAT_CHANNELS.map((item) => (
                <button
                  key={item.id}
                  className={channel === item.id ? styles.active : ""}
                  onClick={() => setChannel(item.id)}
                >
                  <span>#</span>
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </button>
              ))}
            </aside>
            <section className={styles.chatPanel}>
              <header className={styles.panelHeader}>
                <div>
                  <small>OPEN CHANNEL</small>
                  <h1># {activeChannel.label}</h1>
                  <p>{activeChannel.description}</p>
                </div>
                <span className={`${styles.liveState} ${styles[connection]}`}>
                  <i />
                  {connection.toUpperCase()}
                </span>
              </header>
              <div className={styles.feed} ref={feedRef} aria-live="polite">
                {!messages.length && (
                  <div className={styles.empty}>
                    <span>NO SIGNAL HISTORY</span>
                    <p>Be the first voice on this channel.</p>
                  </div>
                )}
                {messages.map((message) => {
                  const ownsMessage = currentUser?.id === message.userId;
                  const canDelete = Boolean(ownsMessage || isModerator);
                  return (
                    <article
                      className={styles.message}
                      id={`message-${message.id}`}
                      key={message.id}
                    >
                      <Avatar
                        name={message.displayName}
                        image={message.avatarUrl}
                      />
                      <div>
                        <header className={controls.actionHeader}>
                          <b>{message.displayName}</b>
                          <time>
                            {formatTime(message.createdAt)}
                            {message.updatedAt ? " · EDITED" : ""}
                          </time>
                          <div className={controls.itemActions}>
                            {currentUser && (
                              <button onClick={() => setReplyingTo(message)}>
                                REPLY
                              </button>
                            )}
                            {canDelete && (
                              <>
                                {ownsMessage && (
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(message.id);
                                      setEditingMessageText(message.content);
                                      setConfirmDelete(null);
                                    }}
                                  >
                                    EDIT
                                  </button>
                                )}
                                <button
                                  className={
                                    confirmDelete === `chat:${message.id}`
                                      ? controls.confirm
                                      : controls.danger
                                  }
                                  disabled={busyAction !== null}
                                  onClick={() =>
                                    confirmDelete === `chat:${message.id}`
                                      ? void deleteMessage(message.id)
                                      : setConfirmDelete(`chat:${message.id}`)
                                  }
                                >
                                  {confirmDelete === `chat:${message.id}`
                                    ? "CONFIRM"
                                    : "DELETE"}
                                </button>
                              </>
                            )}
                          </div>
                        </header>
                        {editingMessageId === message.id ? (
                          <div className={controls.inlineEditor}>
                            <textarea
                              value={editingMessageText}
                              onChange={(event) =>
                                setEditingMessageText(event.target.value)
                              }
                              maxLength={500}
                              autoFocus
                            />
                            <div>
                              <button onClick={() => setEditingMessageId(null)}>
                                CANCEL
                              </button>
                              <button
                                className={controls.primary}
                                disabled={busyAction !== null}
                                onClick={() => void saveMessage(message.id)}
                              >
                                SAVE
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {message.replyTo && (
                              <button
                                className={styles.replyQuote}
                                onClick={() =>
                                  document
                                    .getElementById(`message-${message.replyTo!.id}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                                }
                              >
                                <b>{message.replyTo.displayName}</b>
                                <span>{message.replyTo.content}</span>
                              </button>
                            )}
                            <p>{renderMessageContent(message.content, mentionMembers)}</p>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {currentUser ? (
                <form className={styles.composer} onSubmit={transmit}>
                  {replyingTo && (
                    <div className={styles.replyingBanner}>
                      <span>
                        REPLYING TO <b>{replyingTo.displayName}</b>
                      </span>
                      <button type="button" onClick={() => setReplyingTo(null)}>
                        CANCEL
                      </button>
                    </div>
                  )}
                  <textarea
                    value={chatText}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChatText(value);
                      setMentionUserIds((current) => current.filter((userId) => {
                        const member = mentionMembers.find((item) => item.id === userId);
                        return Boolean(member && value.toLocaleLowerCase().includes(`@${member.name.toLocaleLowerCase()}`));
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (mentionSuggestions.length && (event.key === "Enter" || event.key === "Tab")) {
                        event.preventDefault();
                        selectMention(mentionSuggestions[0]);
                        return;
                      }
                      if (submitChatOnEnter(event)) void transmit();
                    }}
                    maxLength={500}
                    placeholder={`Transmit to #${activeChannel.label.toLowerCase()}…`}
                  />
                  {mentionSuggestions.length > 0 && (
                    <div className={styles.mentionSuggestions} role="listbox" aria-label="Mention a member">
                      {mentionSuggestions.map((member) => (
                        <button type="button" role="option" aria-selected="false" key={member.id} onClick={() => selectMention(member)}>
                          <Avatar name={member.name} image={member.image} />
                          <span><b>{member.name}</b><small>MENTION MEMBER</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                  <span>{chatText.length}/500</span>
                  <button>
                    TRANSMIT <i>↗</i>
                  </button>
                </form>
              ) : (
                <Link
                  className={styles.signinPrompt}
                  href="/login?returnTo=%2Fcommunity"
                >
                  SIGN IN TO TRANSMIT <span>→</span>
                </Link>
              )}
            </section>
            <CommunityMembersPanel
              currentUser={currentUser}
              onNotice={setNotice}
            />
          </div>
        )}

        {mode === "forum" && (
          <div className={`${styles.workspace} ${styles.withMembers}`}>
            <aside className={styles.channelRail}>
              <p>FORUM CATEGORIES</p>
              {FORUM_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  className={category === item.id ? styles.active : ""}
                  onClick={() => {
                    setCategory(item.id);
                    setSelectedId(null);
                    setSelectedThread(null);
                    setReplies([]);
                  }}
                >
                  <span>
                    {item.id === "feedback"
                      ? "◫"
                      : item.id === "suggestions"
                        ? "◇"
                        : "△"}
                  </span>
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </button>
              ))}
            </aside>
            <section className={styles.forumPanel}>
              {selectedThread ? (
                <div className={styles.threadView}>
                  <button
                    className={styles.back}
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedThread(null);
                      setReplies([]);
                      setEditingThread(false);
                    }}
                  >
                    ← BACK TO {activeCategory.label}
                  </button>
                  <article className={styles.originalPost}>
                    <header>
                      <span>
                        {activeCategory.label}
                        {" // "}
                        {selectedThread.status.toUpperCase()}
                      </span>
                      <time>
                        {formatTime(selectedThread.createdAt)}
                        {selectedThread.updatedAt !== selectedThread.createdAt
                          ? " · EDITED"
                          : ""}
                      </time>
                    </header>
                    {editingThread ? (
                      <div className={controls.threadEditor}>
                        <input
                          value={editingThreadTitle}
                          onChange={(event) =>
                            setEditingThreadTitle(event.target.value)
                          }
                          maxLength={100}
                        />
                        <textarea
                          value={editingThreadBody}
                          onChange={(event) =>
                            setEditingThreadBody(event.target.value)
                          }
                          maxLength={4000}
                        />
                        <div>
                          <button onClick={() => setEditingThread(false)}>
                            CANCEL
                          </button>
                          <button
                            className={controls.primary}
                            disabled={busyAction !== null}
                            onClick={() => void saveThread()}
                          >
                            SAVE THREAD
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h1>{selectedThread.title}</h1>
                        <div className={styles.author}>
                          <Avatar
                            name={selectedThread.authorName}
                            image={selectedThread.authorImage}
                          />
                          <b>{selectedThread.authorName}</b>
                        </div>
                        <p>{selectedThread.body}</p>
                      </>
                    )}
                    <div className={controls.threadActions}>
                      {currentUser?.id === selectedThread.authorId &&
                        !editingThread && (
                          <button
                            onClick={() => {
                              setEditingThread(true);
                              setEditingThreadTitle(selectedThread.title);
                              setEditingThreadBody(selectedThread.body);
                            }}
                          >
                            EDIT THREAD
                          </button>
                        )}
                      {(currentUser?.id === selectedThread.authorId ||
                        isModerator) && (
                        <button
                          className={
                            confirmDelete === `thread:${selectedThread.id}`
                              ? controls.confirm
                              : controls.danger
                          }
                          disabled={busyAction !== null}
                          onClick={() =>
                            confirmDelete === `thread:${selectedThread.id}`
                              ? void deleteThread()
                              : setConfirmDelete(`thread:${selectedThread.id}`)
                          }
                        >
                          {confirmDelete === `thread:${selectedThread.id}`
                            ? "CONFIRM DELETE"
                            : "DELETE THREAD"}
                        </button>
                      )}
                      {isModerator && (
                        <>
                          <button
                            disabled={
                              busyAction !== null ||
                              selectedThread.status === "open"
                            }
                            onClick={() => void updateThreadStatus("open")}
                          >
                            OPEN
                          </button>
                          <button
                            disabled={
                              busyAction !== null ||
                              selectedThread.status === "resolved"
                            }
                            onClick={() => void updateThreadStatus("resolved")}
                          >
                            RESOLVE
                          </button>
                          <button
                            disabled={
                              busyAction !== null ||
                              selectedThread.status === "locked"
                            }
                            onClick={() => void updateThreadStatus("locked")}
                          >
                            LOCK
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                  <div className={styles.replyList}>
                    <h2>
                      {replies.length.toString().padStart(2, "0")} RESPONSES
                    </h2>
                    {replies.map((item) => {
                      const ownsReply = currentUser?.id === item.authorId;
                      const canDelete = Boolean(ownsReply || isModerator);
                      return (
                        <article key={item.id}>
                          <header className={controls.actionHeader}>
                            <Avatar
                              name={item.authorName}
                              image={item.authorImage}
                            />
                            <b>{item.authorName}</b>
                            <time>
                              {formatTime(item.createdAt)}
                              {item.updatedAt !== item.createdAt
                                ? " · EDITED"
                                : ""}
                            </time>
                            {(ownsReply || canDelete) && (
                              <div className={controls.itemActions}>
                                {ownsReply && (
                                  <button
                                    onClick={() => {
                                      setEditingReplyId(item.id);
                                      setEditingReplyBody(item.body);
                                    }}
                                  >
                                    EDIT
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className={
                                      confirmDelete === `reply:${item.id}`
                                        ? controls.confirm
                                        : controls.danger
                                    }
                                    disabled={busyAction !== null}
                                    onClick={() =>
                                      confirmDelete === `reply:${item.id}`
                                        ? void deleteReply(item.id)
                                        : setConfirmDelete(`reply:${item.id}`)
                                    }
                                  >
                                    {confirmDelete === `reply:${item.id}`
                                      ? "CONFIRM"
                                      : "DELETE"}
                                  </button>
                                )}
                              </div>
                            )}
                          </header>
                          {editingReplyId === item.id ? (
                            <div className={controls.inlineEditor}>
                              <textarea
                                value={editingReplyBody}
                                onChange={(event) =>
                                  setEditingReplyBody(event.target.value)
                                }
                                maxLength={3000}
                                autoFocus
                              />
                              <div>
                                <button onClick={() => setEditingReplyId(null)}>
                                  CANCEL
                                </button>
                                <button
                                  className={controls.primary}
                                  disabled={busyAction !== null}
                                  onClick={() => void saveReply(item.id)}
                                >
                                  SAVE
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p>{item.body}</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {currentUser && selectedThread.status !== "locked" ? (
                    <form className={styles.replyComposer} onSubmit={reply}>
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        maxLength={3000}
                        placeholder="Add to this transmission…"
                      />
                      <button>POST RESPONSE</button>
                    </form>
                  ) : !currentUser ? (
                    <Link
                      className={styles.signinPrompt}
                      href="/login?returnTo=%2Fcommunity"
                    >
                      SIGN IN TO RESPOND <span>→</span>
                    </Link>
                  ) : (
                    <p className={controls.lockedNotice}>
                      THREAD LOCKED BY MODERATION
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <header className={styles.panelHeader}>
                    <div>
                      <small>COMMUNITY ARCHIVE</small>
                      <h1>{activeCategory.label}</h1>
                      <p>{activeCategory.description}</p>
                    </div>
                    {currentUser ? (
                      <button
                        className={styles.newThread}
                        onClick={() => setNewThreadOpen((open) => !open)}
                      >
                        + NEW THREAD
                      </button>
                    ) : (
                      <Link
                        className={styles.newThread}
                        href="/login?returnTo=%2Fcommunity"
                      >
                        SIGN IN TO POST
                      </Link>
                    )}
                  </header>
                  {newThreadOpen && (
                    <form
                      className={styles.threadComposer}
                      onSubmit={createThread}
                    >
                      <label>
                        TRANSMISSION SUBJECT
                        <input
                          value={threadTitle}
                          onChange={(event) =>
                            setThreadTitle(event.target.value)
                          }
                          minLength={4}
                          maxLength={100}
                          required
                        />
                      </label>
                      <label>
                        DETAILS
                        <textarea
                          value={threadBody}
                          onChange={(event) =>
                            setThreadBody(event.target.value)
                          }
                          minLength={10}
                          maxLength={4000}
                          required
                        />
                      </label>
                      <div>
                        <button
                          type="button"
                          onClick={() => setNewThreadOpen(false)}
                        >
                          CANCEL
                        </button>
                        <button>OPEN THREAD</button>
                      </div>
                    </form>
                  )}
                  <div className={styles.threadList}>
                    {!threads.length && (
                      <div className={styles.empty}>
                        <span>ARCHIVE EMPTY</span>
                        <p>Open the first thread in this category.</p>
                      </div>
                    )}
                    {threads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => {
                          setSelectedId(thread.id);
                          void loadThread(thread.id);
                        }}
                      >
                        <Avatar
                          name={thread.authorName}
                          image={thread.authorImage}
                        />
                        <div>
                          <span>
                            {thread.category.replace("-", " ").toUpperCase()}
                            {" // "}
                            {thread.status.toUpperCase()}
                          </span>
                          <h2>{thread.title}</h2>
                          <p>{thread.body}</p>
                          <small>
                            {thread.authorName} · {formatTime(thread.updatedAt)}
                          </small>
                        </div>
                        <strong>
                          {thread.replyCount.toString().padStart(2, "0")}
                          <small>REPLIES</small>
                        </strong>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
            <CommunityMembersPanel
              currentUser={currentUser}
              onNotice={setNotice}
            />
          </div>
        )}

        {mode === "clans" && (
          <ClanConsole currentUser={currentUser} onNotice={setNotice} />
        )}

        {mode === "staff" && currentUser?.role === "admin" && (
          <section className={controls.staffPanel}>
            <header>
              <small>ADMINISTRATION // STAFF AUTHORITY</small>
              <h1>COMMUNITY STAFF.</h1>
              <p>
                Search registered members and assign moderation access. Admins
                can manage staff; moderators can manage content.
              </p>
            </header>
            <form
              className={controls.staffSearch}
              onSubmit={(event) => {
                event.preventDefault();
                const query = staffQuery.trim();
                setActiveStaffQuery(query);
                void loadStaff(query);
              }}
            >
              <input
                value={staffQuery}
                onChange={(event) => setStaffQuery(event.target.value)}
                placeholder="Search name or email"
                minLength={2}
              />
              <button>SEARCH MEMBERS</button>
            </form>
            <div className={controls.staffList}>
              {!staffUsers.length && (
                <div className={styles.empty}>
                  <span>NO REGISTERED MEMBERS FOUND</span>
                  <p>Try another name or email address.</p>
                </div>
              )}
              {staffUsers.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.email}</small>
                  </div>
                  <select
                    aria-label={`Role for ${item.name}`}
                    value={item.role}
                    disabled={busyAction !== null}
                    onChange={(event) =>
                      void assignRole(
                        item.id,
                        event.target.value as CommunityRole,
                      )
                    }
                  >
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Administrator</option>
                  </select>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
      <footer className={styles.footer}>
        <span>© 2026 NIMBLE GAME STUDIOS // BLACK VECTOR™</span>
        <span>RESPECT THE CREW. REPORT CLEARLY. ARGUE THE IDEA.</span>
      </footer>
      {notice && (
        <button className={styles.notice} onClick={() => setNotice("")}>
          {notice}
          <span>×</span>
        </button>
      )}
    </div>
  );
}
