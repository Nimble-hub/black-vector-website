"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { CommunityChatMessage } from "@/lib/community";
import social from "./community-social.module.css";

interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  description: string;
  ownerId: string;
  memberCount: number;
  memberRole: "owner" | "officer" | "member" | null;
}

interface ClanMember {
  id: string;
  name: string;
  image: string | null;
  role: "owner" | "officer" | "member";
  online: boolean;
  presenceStatus: "online" | "dnd" | "offline";
}

interface ClanThread {
  id: string;
  title: string;
  body: string;
  status: "open" | "locked";
  reply_count: number;
  created_at: number;
  updated_at: number;
  author_id: string;
  author_name: string;
  author_image: string | null;
}

interface ClanReply {
  id: string;
  body: string;
  created_at: number;
  author_id: string;
  author_name: string;
  author_image: string | null;
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

function Avatar({ name, image }: { name: string; image: string | null }) {
  return image ? (
    <Image src={image} alt="" width={32} height={32} unoptimized />
  ) : (
    <i>{initials(name)}</i>
  );
}

export function ClanConsole({
  currentUser,
  onNotice,
}: {
  currentUser: { id: string; name: string } | null;
  onNotice: (message: string) => void;
}) {
  const [clans, setClans] = useState<ClanSummary[]>([]);
  const [discover, setDiscover] = useState<ClanSummary[]>([]);
  const [selected, setSelected] = useState<ClanSummary | null>(null);
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [view, setView] = useState<"chat" | "forum">("chat");
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [threads, setThreads] = useState<ClanThread[]>([]);
  const [thread, setThread] = useState<ClanThread | null>(null);
  const [replies, setReplies] = useState<ClanReply[]>([]);
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [clanName, setClanName] = useState("");
  const [clanTag, setClanTag] = useState("");
  const [clanDescription, setClanDescription] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  const loadClans = useCallback(async () => {
    if (!currentUser) return;
    const response = await fetch("/api/community/clans", { cache: "no-store" });
    const data = (await response.json()) as {
      clans?: ClanSummary[];
      discover?: ClanSummary[];
      error?: string;
    };
    if (!response.ok)
      return onNotice(data.error ?? "Clan network is unavailable.");
    setClans(data.clans ?? []);
    setDiscover(data.discover ?? []);
    setSelected((current) => current ?? data.clans?.[0] ?? null);
  }, [currentUser, onNotice]);

  const loadDetail = useCallback(
    async (clanId: string) => {
      const response = await fetch(`/api/community/clans/${clanId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        members?: ClanMember[];
        error?: string;
      };
      if (!response.ok)
        return onNotice(data.error ?? "Clan roster could not be loaded.");
      setMembers(data.members ?? []);
    },
    [onNotice],
  );

  const loadChat = useCallback(
    async (clanId: string, quiet = false) => {
      const response = await fetch(`/api/community/clans/${clanId}/chat`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        messages?: CommunityChatMessage[];
        error?: string;
      };
      if (!response.ok) {
        if (!quiet) onNotice(data.error ?? "Clan comms could not be loaded.");
        return;
      }
      setMessages(data.messages ?? []);
    },
    [onNotice],
  );

  const loadThreads = useCallback(
    async (clanId: string) => {
      const response = await fetch(`/api/community/clans/${clanId}/forum`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        threads?: ClanThread[];
        error?: string;
      };
      if (!response.ok)
        return onNotice(
          data.error ?? "Clan operations board could not be loaded.",
        );
      setThreads(data.threads ?? []);
    },
    [onNotice],
  );

  useEffect(() => {
    queueMicrotask(() => void loadClans());
  }, [loadClans]);

  useEffect(() => {
    if (!selected) return;
    queueMicrotask(() => {
      void loadDetail(selected.id);
      void loadChat(selected.id);
      void loadThreads(selected.id);
    });
    const timer = window.setInterval(() => {
      if (view === "chat") void loadChat(selected.id, true);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [loadChat, loadDetail, loadThreads, selected, view]);

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function createClan(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/community/clans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: clanName,
        tag: clanTag,
        description: clanDescription,
      }),
    });
    const data = (await response.json()) as {
      clan?: ClanSummary;
      error?: string;
    };
    if (!response.ok || !data.clan)
      return onNotice(data.error ?? "Clan could not be commissioned.");
    setClanName("");
    setClanTag("");
    setClanDescription("");
    setCreateOpen(false);
    await loadClans();
    setSelected(data.clan);
  }

  async function joinClan(clanId: string) {
    const response = await fetch("/api/community/clans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "join", clanId }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok)
      return onNotice(data.error ?? "Clan could not be joined.");
    await loadClans();
    setSelected({
      ...discover.find((item) => item.id === clanId)!,
      memberRole: "member",
    });
  }

  async function transmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !chatText.trim()) return;
    const content = chatText.trim();
    setChatText("");
    const response = await fetch(`/api/community/clans/${selected.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = (await response.json()) as {
      message?: CommunityChatMessage;
      error?: string;
    };
    if (!response.ok || !data.message) {
      setChatText(content);
      return onNotice(data.error ?? "Clan transmission failed.");
    }
    setMessages((current) => [
      ...current.filter((item) => item.id !== data.message!.id),
      data.message!,
    ]);
  }

  async function createThread(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const response = await fetch(`/api/community/clans/${selected.id}/forum`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "thread", title, body }),
    });
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !data.id)
      return onNotice(data.error ?? "Clan thread could not be opened.");
    setTitle("");
    setBody("");
    setComposer(false);
    await loadThreads(selected.id);
    await openThread(data.id);
  }

  async function openThread(threadId: string) {
    if (!selected) return;
    const response = await fetch(
      `/api/community/clans/${selected.id}/forum?threadId=${threadId}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      thread?: ClanThread;
      replies?: ClanReply[];
      error?: string;
    };
    if (!response.ok || !data.thread)
      return onNotice(data.error ?? "Clan thread could not be loaded.");
    setThread(data.thread);
    setReplies(data.replies ?? []);
  }

  async function postReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || !thread || !reply.trim()) return;
    const response = await fetch(`/api/community/clans/${selected.id}/forum`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "reply", threadId: thread.id, body: reply }),
    });
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) return onNotice(data.error ?? "Clan response failed.");
    setReply("");
    await openThread(thread.id);
    void loadThreads(selected.id);
  }

  if (!currentUser) {
    return (
      <div className={social.clanSignIn}>
        <strong>CLAN NETWORK LOCKED</strong>
        <p>
          Sign in to form groups, coordinate private comms, and maintain a clan
          operations board.
        </p>
        <Link href="/login?returnTo=%2Fcommunity">SIGN IN TO CONTINUE</Link>
      </div>
    );
  }

  return (
    <div className={social.clanWorkspace}>
      <aside className={social.clanRail}>
        <header>
          <small>YOUR FORMATIONS</small>
          <button onClick={() => setCreateOpen((value) => !value)}>
            + FORM CLAN
          </button>
        </header>
        {createOpen && (
          <form onSubmit={createClan} className={social.clanCreate}>
            <input
              value={clanName}
              onChange={(event) => setClanName(event.target.value)}
              placeholder="Clan name"
              minLength={3}
              maxLength={40}
              required
            />
            <input
              value={clanTag}
              onChange={(event) => setClanTag(event.target.value.toUpperCase())}
              placeholder="TAG"
              minLength={2}
              maxLength={6}
              required
            />
            <textarea
              value={clanDescription}
              onChange={(event) => setClanDescription(event.target.value)}
              placeholder="Purpose and doctrine"
              minLength={10}
              maxLength={500}
              required
            />
            <button>COMMISSION</button>
          </form>
        )}
        {clans.map((clan) => (
          <button
            key={clan.id}
            className={selected?.id === clan.id ? social.active : ""}
            onClick={() => {
              setThread(null);
              setReplies([]);
              setSelected(clan);
            }}
          >
            <b>
              [{clan.tag}] {clan.name}
            </b>
            <small>
              {clan.memberCount} MEMBERS · {clan.memberRole?.toUpperCase()}
            </small>
          </button>
        ))}
        <p>DISCOVER</p>
        {discover.slice(0, 10).map((clan) => (
          <article key={clan.id}>
            <span>
              <b>
                [{clan.tag}] {clan.name}
              </b>
              <small>{clan.memberCount} MEMBERS</small>
            </span>
            <button onClick={() => void joinClan(clan.id)}>JOIN</button>
          </article>
        ))}
      </aside>

      {selected ? (
        <section className={social.clanMain}>
          <header className={social.clanHeader}>
            <div>
              <small>CLAN NETWORK // {selected.tag}</small>
              <h1>{selected.name}</h1>
              <p>{selected.description}</p>
            </div>
            <nav>
              <button
                className={view === "chat" ? social.active : ""}
                onClick={() => setView("chat")}
              >
                CLAN COMMS
              </button>
              <button
                className={view === "forum" ? social.active : ""}
                onClick={() => setView("forum")}
              >
                OPERATIONS BOARD
              </button>
            </nav>
          </header>
          {view === "chat" ? (
            <>
              <div className={social.clanFeed} ref={feedRef}>
                {!messages.length && (
                  <p className={social.emptySocial}>
                    PRIVATE CLAN CHANNEL READY.
                  </p>
                )}
                {messages.map((message) => (
                  <article key={message.id}>
                    <Avatar
                      name={message.displayName}
                      image={message.avatarUrl}
                    />
                    <div>
                      <header>
                        <b>{message.displayName}</b>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </header>
                      <p>{message.content}</p>
                    </div>
                  </article>
                ))}
              </div>
              <form className={social.clanComposer} onSubmit={transmit}>
                <textarea
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  maxLength={1000}
                  placeholder={`Transmit to [${selected.tag}]…`}
                />
                <button>TRANSMIT</button>
              </form>
            </>
          ) : thread ? (
            <div className={social.clanThread}>
              <button
                onClick={() => {
                  setThread(null);
                  setReplies([]);
                }}
              >
                ← OPERATIONS BOARD
              </button>
              <article>
                <small>
                  {thread.status.toUpperCase()} · {thread.author_name}
                </small>
                <h2>{thread.title}</h2>
                <p>{thread.body}</p>
              </article>
              {replies.map((item) => (
                <article key={item.id}>
                  <small>{item.author_name}</small>
                  <p>{item.body}</p>
                </article>
              ))}
              <form onSubmit={postReply}>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={3000}
                  placeholder="Post a response…"
                />
                <button>POST RESPONSE</button>
              </form>
            </div>
          ) : (
            <div className={social.clanForum}>
              <header>
                <div>
                  <small>PRIVATE ARCHIVE</small>
                  <h2>OPERATIONS BOARD</h2>
                </div>
                <button onClick={() => setComposer((value) => !value)}>
                  + NEW THREAD
                </button>
              </header>
              {composer && (
                <form onSubmit={createThread}>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    minLength={4}
                    maxLength={100}
                    placeholder="Operation title"
                    required
                  />
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    minLength={4}
                    maxLength={4000}
                    placeholder="Orders, doctrine, or discussion"
                    required
                  />
                  <button>OPEN THREAD</button>
                </form>
              )}
              <div>
                {threads.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void openThread(item.id)}
                  >
                    <span>
                      <small>{item.author_name}</small>
                      <b>{item.title}</b>
                      <p>{item.body}</p>
                    </span>
                    <strong>
                      {item.reply_count}
                      <small>REPLIES</small>
                    </strong>
                  </button>
                ))}
                {!threads.length && (
                  <p className={social.emptySocial}>
                    NO CLAN OPERATIONS POSTED.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className={social.clanEmpty}>
          <strong>FORM OR JOIN A CLAN</strong>
          <p>
            Clans receive a private chat channel, an operations forum, and a
            dedicated crew roster.
          </p>
        </section>
      )}

      <aside className={social.clanRoster}>
        <header>
          <small>{selected?.tag ?? "CLAN"}</small>
          <strong>ROSTER</strong>
        </header>
        {members.map((member) => (
          <article key={member.id}>
            <Avatar name={member.name} image={member.image} />
            <span>
              <b>{member.name}</b>
              <small className={member.online ? social.online : ""}>
                {member.presenceStatus === "dnd"
                  ? "DO NOT DISTURB"
                  : member.online
                    ? "ONLINE"
                    : member.role.toUpperCase()}
              </small>
            </span>
          </article>
        ))}
      </aside>
    </div>
  );
}
