"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityNotification } from "@/lib/community";
import styles from "./community.module.css";

function relativeTime(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "NOW";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
}

export function CommunityNotifications({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const response = await fetch("/api/community/notifications", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      notifications?: CommunityNotification[];
      unreadCount?: number;
    };
    setItems(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
  }, [enabled]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  async function markRead(id: string) {
    const wasUnread = items.some((item) => item.id === id && !item.readAt);
    if (wasUnread) {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: Date.now() } : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    await fetch("/api/community/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
  }

  async function markAllRead() {
    const now = Date.now();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount(0);
    await fetch("/api/community/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    });
  }

  if (!enabled) return null;
  return (
    <div className={styles.notificationRoot} ref={rootRef}>
      <button
        className={styles.notificationTrigger}
        aria-expanded={open}
        aria-label={`${unreadCount} unread notifications`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">◇</span>
        ALERTS
        {unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
      </button>
      {open && (
        <section className={styles.notificationPanel} aria-label="Notifications">
          <header>
            <div>
              <small>PERSONAL UPLINK</small>
              <strong>NOTIFICATIONS</strong>
            </div>
            {unreadCount > 0 && <button onClick={() => void markAllRead()}>MARK ALL READ</button>}
          </header>
          <div>
            {!items.length && <p className={styles.notificationEmpty}>NO NEW SIGNALS.</p>}
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={item.readAt ? styles.notificationRead : styles.notificationUnread}
                onClick={(event) => {
                  void markRead(item.id);
                  if (item.type === "mention") {
                    event.preventDefault();
                    window.location.assign(item.href);
                  }
                }}
              >
                {item.actorImage ? (
                  <Image src={item.actorImage} alt="" width={34} height={34} unoptimized />
                ) : (
                  <i>{item.actorName?.slice(0, 2).toUpperCase() ?? "BV"}</i>
                )}
                <span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>{relativeTime(item.createdAt)} AGO</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
