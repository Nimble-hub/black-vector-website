"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CHAT_CHANNELS,
  FORUM_CATEGORIES,
  type ChatChannelId,
  type CommunityChatMessage,
  type ForumCategoryId,
} from "@/lib/community";
import styles from "./community.module.css";

interface CurrentUser { id: string; name: string }
interface ForumThread {
  id: string;
  category: ForumCategoryId;
  title: string;
  body: string;
  status: "open" | "resolved" | "locked";
  replyCount: number;
  createdAt: string | number;
  updatedAt: string | number;
  authorName: string;
  authorImage: string | null;
}
interface ForumReply {
  id: string;
  body: string;
  createdAt: string | number;
  updatedAt: string | number;
  authorName: string;
  authorImage: string | null;
}

function formatTime(value: string | number) {
  const date = new Date(value);
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BV";
}

function Avatar({ name, image }: { name: string; image?: string | null }) {
  return image
    ? <Image src={image} alt="" width={34} height={34} unoptimized style={{ display: "block", flex: "0 0 auto", width: 34, height: 34, border: "1px solid rgba(87,186,194,.35)", objectFit: "cover" }} />
    : <i>{initials(name)}</i>;
}

export function CommunityConsole({ currentUser }: { currentUser: CurrentUser | null }) {
  const [mode, setMode] = useState<"chat" | "forum">("chat");
  const [channel, setChannel] = useState<ChatChannelId>("general");
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [chatText, setChatText] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState<ForumCategoryId>("feedback");
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/community/chat/${channel}/socket`);
      socket.addEventListener("open", () => setConnection("live"));
      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data)) as
          | { type: "snapshot"; messages: CommunityChatMessage[] }
          | { type: "message"; message: CommunityChatMessage };
        if (payload.type === "snapshot") setMessages(payload.messages);
        if (payload.type === "message") {
          setMessages((current) => [...current.filter((item) => item.id !== payload.message.id), payload.message].slice(-100));
        }
      });
      socket.addEventListener("close", () => {
        setConnection("offline");
        if (!stopped) timer = setTimeout(connect, 1800);
      });
      socket.addEventListener("error", () => socket?.close());
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [channel]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/community/forum?category=${category}`, { cache: "no-store" });
    const data = await response.json() as { threads?: ForumThread[] };
    setThreads(data.threads ?? []);
  }, [category]);

  useEffect(() => {
    let ignore = false;
    void fetch(`/api/community/forum?category=${category}`, { cache: "no-store" })
      .then(async (response) => await response.json() as { threads?: ForumThread[] })
      .then((data) => { if (!ignore) setThreads(data.threads ?? []); });
    return () => { ignore = true; };
  }, [category]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    void fetch(`/api/community/forum/${selectedId}`, { cache: "no-store" })
      .then(async (response) => await response.json() as { thread?: ForumThread; replies?: ForumReply[] })
      .then((data) => {
        setSelectedThread(data.thread ?? null);
        setReplies(data.replies ?? []);
      });
  }, [selectedId]);

  const activeChannel = useMemo(() => CHAT_CHANNELS.find((item) => item.id === channel)!, [channel]);
  const activeCategory = useMemo(() => FORUM_CATEGORIES.find((item) => item.id === category)!, [category]);

  async function transmit(event: FormEvent) {
    event.preventDefault();
    if (!chatText.trim() || !currentUser) return;
    const content = chatText.trim();
    setChatText("");
    const response = await fetch(`/api/community/chat/${channel}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setNotice(data.error ?? "Transmission failed.");
      setChatText(content);
    }
  }

  async function createThread(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/community/forum", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, title: threadTitle, body: threadBody }),
    });
    const data = await response.json() as { error?: string; thread?: ForumThread };
    if (!response.ok || !data.thread) return setNotice(data.error ?? "Unable to open thread.");
    setThreadTitle(""); setThreadBody(""); setNewThreadOpen(false);
    await loadThreads(); setSelectedId(data.thread.id);
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    const response = await fetch(`/api/community/forum/${selectedId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: replyBody }),
    });
    const data = await response.json() as { error?: string; reply?: ForumReply };
    if (!response.ok || !data.reply) return setNotice(data.error ?? "Reply failed.");
    setReplyBody(""); setReplies((current) => [...current, data.reply!]);
    setSelectedThread((current) => current ? { ...current, replyCount: current.replyCount + 1 } : current);
    void loadThreads();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/"><span>BV</span><strong>BLACK VECTOR</strong></Link>
        <div className={styles.title}><small>PUBLIC NETWORK // COMMUNITY NODE</small><b>THE UPLINK</b></div>
        <nav aria-label="Community navigation">
          <Link href="/">HOME</Link>
          <Link href="/playtest">PLAYTEST</Link>
          <Link href="/account">ACCOUNT</Link>
        </nav>
      </header>

      <section className={styles.console}>
        <aside className={styles.modeRail}>
          <p>NETWORK MODES</p>
          <button className={mode === "chat" ? styles.active : ""} onClick={() => setMode("chat")}>
            <span>01</span><b>LIVE COMMS</b><small>REALTIME CHANNELS</small>
          </button>
          <button className={mode === "forum" ? styles.active : ""} onClick={() => setMode("forum")}>
            <span>02</span><b>FORUM ARCHIVE</b><small>FEEDBACK & REPORTS</small>
          </button>
          <div className={styles.identity}>
            <i>{currentUser ? initials(currentUser.name) : "--"}</i>
            <span><small>IDENTITY</small><b>{currentUser?.name ?? "OBSERVER"}</b></span>
          </div>
        </aside>

        {mode === "chat" ? (
          <div className={styles.workspace}>
            <aside className={styles.channelRail}>
              <p>COMMS CHANNELS</p>
              {CHAT_CHANNELS.map((item) => (
                <button key={item.id} className={channel === item.id ? styles.active : ""} onClick={() => setChannel(item.id)}>
                  <span>#</span><b>{item.label}</b><small>{item.description}</small>
                </button>
              ))}
            </aside>
            <section className={styles.chatPanel}>
              <header className={styles.panelHeader}>
                <div><small>OPEN CHANNEL</small><h1># {activeChannel.label}</h1><p>{activeChannel.description}</p></div>
                <span className={`${styles.liveState} ${styles[connection]}`}><i />{connection.toUpperCase()}</span>
              </header>
              <div className={styles.feed} ref={feedRef} aria-live="polite">
                {!messages.length && <div className={styles.empty}><span>NO SIGNAL HISTORY</span><p>Be the first voice on this channel.</p></div>}
                {messages.map((message) => (
                  <article className={styles.message} key={message.id}>
                    <Avatar name={message.displayName} image={message.avatarUrl} />
                    <div><header><b>{message.displayName}</b><time>{formatTime(message.createdAt)}</time></header><p>{message.content}</p></div>
                  </article>
                ))}
              </div>
              {currentUser ? (
                <form className={styles.composer} onSubmit={transmit}>
                  <textarea value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={500} placeholder={`Transmit to #${activeChannel.label.toLowerCase()}…`} />
                  <span>{chatText.length}/500</span><button>TRANSMIT <i>↗</i></button>
                </form>
              ) : (
                <Link className={styles.signinPrompt} href="/login?returnTo=%2Fcommunity">SIGN IN TO TRANSMIT <span>→</span></Link>
              )}
            </section>
          </div>
        ) : (
          <div className={styles.workspace}>
            <aside className={styles.channelRail}>
              <p>FORUM CATEGORIES</p>
              {FORUM_CATEGORIES.map((item) => (
                <button key={item.id} className={category === item.id ? styles.active : ""} onClick={() => { setCategory(item.id); setSelectedId(null); setSelectedThread(null); setReplies([]); }}>
                  <span>{item.id === "feedback" ? "◫" : item.id === "suggestions" ? "◇" : "△"}</span><b>{item.label}</b><small>{item.description}</small>
                </button>
              ))}
            </aside>
            <section className={styles.forumPanel}>
              {selectedThread ? (
                <div className={styles.threadView}>
                  <button className={styles.back} onClick={() => { setSelectedId(null); setSelectedThread(null); setReplies([]); }}>← BACK TO {activeCategory.label}</button>
                  <article className={styles.originalPost}>
                    <header><span>{activeCategory.label}</span><time>{formatTime(selectedThread.createdAt)}</time></header>
                    <h1>{selectedThread.title}</h1><div className={styles.author}><Avatar name={selectedThread.authorName} image={selectedThread.authorImage} /><b>{selectedThread.authorName}</b></div>
                    <p>{selectedThread.body}</p>
                  </article>
                  <div className={styles.replyList}>
                    <h2>{replies.length.toString().padStart(2, "0")} RESPONSES</h2>
                    {replies.map((item) => <article key={item.id}><header><Avatar name={item.authorName} image={item.authorImage} /><b>{item.authorName}</b><time>{formatTime(item.createdAt)}</time></header><p>{item.body}</p></article>)}
                  </div>
                  {currentUser && selectedThread.status !== "locked" ? <form className={styles.replyComposer} onSubmit={reply}><textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={3000} placeholder="Add to this transmission…"/><button>POST RESPONSE</button></form> : !currentUser ? <Link className={styles.signinPrompt} href="/login?returnTo=%2Fcommunity">SIGN IN TO RESPOND <span>→</span></Link> : null}
                </div>
              ) : (
                <>
                  <header className={styles.panelHeader}>
                    <div><small>COMMUNITY ARCHIVE</small><h1>{activeCategory.label}</h1><p>{activeCategory.description}</p></div>
                    {currentUser ? <button className={styles.newThread} onClick={() => setNewThreadOpen((open) => !open)}>+ NEW THREAD</button> : <Link className={styles.newThread} href="/login?returnTo=%2Fcommunity">SIGN IN TO POST</Link>}
                  </header>
                  {newThreadOpen && <form className={styles.threadComposer} onSubmit={createThread}><label>TRANSMISSION SUBJECT<input value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} minLength={4} maxLength={100} required /></label><label>DETAILS<textarea value={threadBody} onChange={(event) => setThreadBody(event.target.value)} minLength={10} maxLength={4000} required /></label><div><button type="button" onClick={() => setNewThreadOpen(false)}>CANCEL</button><button>OPEN THREAD</button></div></form>}
                  <div className={styles.threadList}>
                    {!threads.length && <div className={styles.empty}><span>ARCHIVE EMPTY</span><p>Open the first thread in this category.</p></div>}
                    {threads.map((thread) => <button key={thread.id} onClick={() => setSelectedId(thread.id)}><Avatar name={thread.authorName} image={thread.authorImage} /><div><span>{thread.category.replace("-", " ").toUpperCase()}{" // "}{thread.status.toUpperCase()}</span><h2>{thread.title}</h2><p>{thread.body}</p><small>{thread.authorName} · {formatTime(thread.updatedAt)}</small></div><strong>{thread.replyCount.toString().padStart(2, "0")}<small>REPLIES</small></strong></button>)}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </section>
      <footer className={styles.footer}><span>COMMUNITY RELAY // PUBLIC</span><span>RESPECT THE CREW. REPORT CLEARLY. ARGUE THE IDEA.</span></footer>
      {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}
    </div>
  );
}
