"use client";

import Image from "next/image";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CommunityChatMessage, CommunityRole } from "@/lib/community";
import social from "./community-social.module.css";
import { submitChatOnEnter } from "@/lib/chat-input";

interface Member {
  id: string;
  name: string;
  image: string | null;
  role: CommunityRole;
  online: boolean;
  lastSeenAt: number | null;
  presenceStatus: "online" | "dnd" | "offline";
}

interface Friend extends Pick<
  Member,
  "id" | "name" | "image" | "online" | "presenceStatus"
> {
  direction?: "incoming" | "outgoing";
}

interface Conversation {
  id: string;
  updatedAt: number;
  member: Pick<Member, "id" | "name" | "image" | "online" | "presenceStatus">;
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

function Avatar({ member }: { member: Pick<Member, "name" | "image"> }) {
  return member.image ? (
    <Image src={member.image} alt="" width={32} height={32} unoptimized />
  ) : (
    <i>{initials(member.name)}</i>
  );
}

export function CommunityMembersPanel({
  currentUser,
  onNotice,
}: {
  currentUser: { id: string; name: string } | null;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"online" | "friends" | "direct">("online");
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Friend[]>([]);
  const [outgoing, setOutgoing] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const dmFeed = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    if (!currentUser) return;
    const response = await fetch("/api/community/members", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      members?: Member[];
      error?: string;
    };
    if (response.ok) setMembers(data.members ?? []);
  }, [currentUser]);

  const loadFriends = useCallback(async () => {
    if (!currentUser) return;
    const response = await fetch("/api/community/friends", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      friends?: Friend[];
      incoming?: Friend[];
      outgoing?: Friend[];
      error?: string;
    };
    if (!response.ok)
      return onNotice(data.error ?? "Friend records are unavailable.");
    setFriends(data.friends ?? []);
    setIncoming(data.incoming ?? []);
    setOutgoing(data.outgoing ?? []);
  }, [currentUser, onNotice]);

  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
    const response = await fetch("/api/community/conversations", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      conversations?: Conversation[];
      error?: string;
    };
    if (!response.ok)
      return onNotice(data.error ?? "Direct comms are unavailable.");
    setConversations(data.conversations ?? []);
  }, [currentUser, onNotice]);

  const loadMessages = useCallback(
    async (conversationId: string, quiet = false) => {
      const response = await fetch(`/api/community/dm/${conversationId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        messages?: CommunityChatMessage[];
        error?: string;
      };
      if (!response.ok) {
        if (!quiet)
          onNotice(data.error ?? "Direct transmission could not be loaded.");
        return;
      }
      setMessages(data.messages ?? []);
    },
    [onNotice],
  );

  useEffect(() => {
    if (!currentUser) return;
    let stopped = false;
    const pulse = async () => {
      await fetch("/api/community/members", { method: "POST" }).catch(
        () => undefined,
      );
      if (!stopped) {
        await Promise.all([loadMembers(), loadFriends(), loadConversations()]);
      }
    };
    queueMicrotask(() => {
      void pulse();
    });
    const timer = window.setInterval(pulse, 15_000);
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void pulse();
    };
    const leave = () => {
      void fetch("/api/community/members", {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pagehide", leave);
    };
  }, [currentUser, loadConversations, loadFriends, loadMembers]);

  useEffect(() => {
    if (!selected) return;
    queueMicrotask(() => void loadMessages(selected.id));
    const timer = window.setInterval(
      () => void loadMessages(selected.id, true),
      3_000,
    );
    return () => window.clearInterval(timer);
  }, [loadMessages, selected]);

  useEffect(() => {
    dmFeed.current?.scrollTo({
      top: dmFeed.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const friendIds = useMemo(
    () => new Set(friends.map((item) => item.id)),
    [friends],
  );
  const outgoingIds = useMemo(
    () => new Set(outgoing.map((item) => item.id)),
    [outgoing],
  );
  const incomingIds = useMemo(
    () => new Set(incoming.map((item) => item.id)),
    [incoming],
  );

  async function requestFriend(targetUserId: string) {
    setBusy(`friend:${targetUserId}`);
    const response = await fetch("/api/community/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(null);
    if (!response.ok) return onNotice(data.error ?? "Friend request failed.");
    await loadFriends();
    onNotice("Friend request sent. Waiting for acceptance.");
  }

  async function changeFriend(
    targetUserId: string,
    action: "accept" | "decline" | "cancel" | "remove",
  ) {
    setBusy(`friend:${targetUserId}`);
    const response = await fetch("/api/community/friends", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUserId, action }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(null);
    if (!response.ok)
      return onNotice(data.error ?? "Friendship could not be changed.");
    await loadFriends();
  }

  async function openDirect(
    member: Pick<Member, "id" | "name" | "image" | "online" | "presenceStatus">,
  ) {
    setBusy(`dm:${member.id}`);
    const response = await fetch("/api/community/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUserId: member.id }),
    });
    const data = (await response.json()) as {
      conversation?: Conversation;
      error?: string;
    };
    setBusy(null);
    if (!response.ok || !data.conversation)
      return onNotice(data.error ?? "Direct channel could not be opened.");
    setSelected(data.conversation);
    setTab("direct");
    await loadConversations();
  }

  async function transmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim()) return;
    const content = text.trim();
    setText("");
    const response = await fetch(`/api/community/dm/${selected.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = (await response.json()) as {
      message?: CommunityChatMessage;
      error?: string;
    };
    if (!response.ok || !data.message) {
      setText(content);
      return onNotice(data.error ?? "Direct transmission failed.");
    }
    setMessages((current) => [
      ...current.filter((item) => item.id !== data.message!.id),
      data.message!,
    ]);
  }

  if (!currentUser) {
    return (
      <aside className={social.membersPanel}>
        <header>
          <small>CREW NETWORK</small>
          <strong>MEMBERS</strong>
        </header>
        <div className={social.signedOut}>
          SIGN IN TO VIEW ONLINE CREW, FRIENDS, AND DIRECT COMMS.
        </div>
      </aside>
    );
  }

  return (
    <aside className={social.membersPanel} aria-label="Community members">
      <header>
        <small>CREW NETWORK</small>
        <strong>{selected ? selected.member.name : "MEMBERS"}</strong>
        {selected && <button onClick={() => setSelected(null)}>BACK</button>}
      </header>
      {!selected && (
        <nav aria-label="Member lists">
          <button
            className={tab === "online" ? social.active : ""}
            onClick={() => setTab("online")}
          >
            ONLINE <b>{members.filter((item) => item.online).length}</b>
          </button>
          <button
            className={tab === "friends" ? social.active : ""}
            onClick={() => setTab("friends")}
          >
            FRIENDS <b>{friends.length}</b>
          </button>
          <button
            className={tab === "direct" ? social.active : ""}
            onClick={() => setTab("direct")}
          >
            DIRECT <b>{conversations.length}</b>
          </button>
        </nav>
      )}

      {selected ? (
        <div className={social.directThread}>
          <div className={social.dmFeed} ref={dmFeed}>
            {!messages.length && (
              <p className={social.emptySocial}>
                DIRECT CHANNEL OPEN. SEND THE FIRST TRANSMISSION.
              </p>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.userId === currentUser.id ? social.mine : ""}
              >
                <b>{message.displayName}</b>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
          <form onSubmit={transmit}>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={submitChatOnEnter}
              maxLength={1000}
              placeholder="Direct transmission…"
            />
            <button>TRANSMIT</button>
          </form>
        </div>
      ) : tab === "online" ? (
        <div className={social.memberList}>
          {members
            .filter((member) => member.online)
            .map((member) => (
              <article key={member.id}>
                <Avatar member={member} />
                <span>
                  <b>{member.name}</b>
                  <small className={member.online ? social.online : ""}>
                    {member.presenceStatus === "dnd"
                      ? "DO NOT DISTURB"
                      : "ONLINE"}
                    {member.role !== "member"
                      ? ` · ${member.role.toUpperCase()}`
                      : ""}
                  </small>
                </span>
                <div>
                  <button
                    disabled={busy !== null}
                    onClick={() => void openDirect(member)}
                  >
                    DM
                  </button>
                  {incomingIds.has(member.id) && (
                    <button
                      disabled={busy !== null}
                      onClick={() => void changeFriend(member.id, "accept")}
                    >
                      ACCEPT
                    </button>
                  )}
                  {!friendIds.has(member.id) &&
                    !outgoingIds.has(member.id) &&
                    !incomingIds.has(member.id) && (
                      <button
                        disabled={busy !== null}
                        onClick={() => void requestFriend(member.id)}
                      >
                        +
                      </button>
                    )}
                </div>
              </article>
            ))}
          {!members.some((member) => member.online) && (
            <p className={social.emptySocial}>NO OTHER CREW ONLINE.</p>
          )}
        </div>
      ) : tab === "friends" ? (
        <div className={social.memberList}>
          {incoming.map((member) => (
            <article key={member.id}>
              <Avatar member={member} />
              <span>
                <b>{member.name}</b>
                <small>INCOMING REQUEST</small>
              </span>
              <div>
                <button onClick={() => void changeFriend(member.id, "accept")}>
                  ACCEPT
                </button>
                <button onClick={() => void changeFriend(member.id, "decline")}>
                  ×
                </button>
              </div>
            </article>
          ))}
          {friends.map((member) => (
            <article key={member.id}>
              <Avatar member={member} />
              <span>
                <b>{member.name}</b>
                <small className={member.online ? social.online : ""}>
                  {member.presenceStatus === "dnd"
                    ? "DO NOT DISTURB"
                    : member.online
                      ? "ONLINE"
                      : "OFFLINE"}
                </small>
              </span>
              <div>
                <button onClick={() => void openDirect(member)}>DM</button>
                <button
                  title="Remove friend"
                  onClick={() => void changeFriend(member.id, "remove")}
                >
                  ×
                </button>
              </div>
            </article>
          ))}
          {outgoing.map((member) => (
            <article key={member.id}>
              <Avatar member={member} />
              <span>
                <b>{member.name}</b>
                <small>REQUEST SENT</small>
              </span>
              <div>
                <button onClick={() => void changeFriend(member.id, "cancel")}>
                  CANCEL
                </button>
              </div>
            </article>
          ))}
          {!friends.length && !incoming.length && !outgoing.length && (
            <p className={social.emptySocial}>NO FRIEND CONNECTIONS YET.</p>
          )}
        </div>
      ) : (
        <div className={social.memberList}>
          {conversations.map((conversation) => (
            <button
              className={social.conversation}
              key={conversation.id}
              onClick={() => setSelected(conversation)}
            >
              <Avatar member={conversation.member} />
              <span>
                <b>{conversation.member.name}</b>
                <small
                  className={conversation.member.online ? social.online : ""}
                >
                  {conversation.member.presenceStatus === "dnd"
                    ? "DO NOT DISTURB"
                    : conversation.member.online
                      ? "ONLINE"
                      : "DIRECT CHANNEL"}
                </small>
              </span>
            </button>
          ))}
          {!conversations.length && (
            <p className={social.emptySocial}>
              OPEN A DIRECT CHANNEL FROM THE ONLINE ROSTER.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
