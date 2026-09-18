"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";

type Notification = {
  id: string;
  scheduleId: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return "剛剛";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

export default function NotificationCenter() {
  const pathname = usePathname();
  const match = pathname.match(/^\/s\/([^/]+)/);
  const scheduleId = match?.[1] === "new" ? null : match?.[1] ?? null;
  const [knownScheduleIds, setKnownScheduleIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stored: string[] = [];
    try {
      const value = JSON.parse(localStorage.getItem("heshi:schedules") ?? "[]");
      if (Array.isArray(value)) stored = value.filter((id): id is string => typeof id === "string");
    } catch {
      localStorage.removeItem("heshi:schedules");
    }
    const next = scheduleId
      ? [scheduleId, ...stored.filter((id) => id !== scheduleId)].slice(0, 20)
      : stored;
    if (scheduleId) localStorage.setItem("heshi:schedules", JSON.stringify(next));
    setKnownScheduleIds(next);
  }, [scheduleId]);

  const refresh = useCallback(async (showLoading = false) => {
    const targets = scheduleId ? [scheduleId] : knownScheduleIds;
    if (!targets.length) {
      setItems([]);
      return;
    }
    if (showLoading) setLoading(true);
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const data = await api(`/${target}/notifications`);
        return data.notifications.map((item: Omit<Notification, "scheduleId">) => ({
          ...item,
          scheduleId: target,
        }));
      }),
    );
    try {
      const notifications = results
        .filter((result): result is PromiseFulfilledResult<Notification[]> => result.status === "fulfilled")
        .flatMap((result) => result.value)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      setItems(notifications);
      setError("");
      if (!notifications.length && results.every((result) => result.status === "rejected"))
        setError(scheduleId ? "" : "暫時無法載入通知。");
    } finally {
      setLoading(false);
    }
  }, [knownScheduleIds, scheduleId]);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("heshi:notifications:refresh", onRefresh);
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => {
      window.removeEventListener("heshi:notifications:refresh", onRefresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const unread = items.some((item) => !item.readAt);

  async function markRead(item: Notification) {
    if (item.readAt) return;
    await api(`/${item.scheduleId}/notifications/${item.id}/read`, "POST");
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
      ),
    );
  }

  async function markAllRead() {
    const targets = [...new Set(items.filter((item) => !item.readAt).map((item) => item.scheduleId))];
    await Promise.all(targets.map((target) => api(`/${target}/notifications/read-all`, "POST")));
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
  }

  return (
    <>
      <button
        className="notification-bell"
        aria-label={unread ? "通知中心，有未讀通知" : "通知中心"}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          void refresh(true);
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23">
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread && <i aria-label="有未讀通知" />}
      </button>
      {open && (
        <div className="notification-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="notification-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="notification-title">通知</h2>
              <div>
                {unread && (
                  <button className="text-button" onClick={() => void markAllRead()}>
                    全部標為已讀
                  </button>
                )}
                <button className="notification-close" aria-label="關閉通知" onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>
            </header>
            <div className="notification-list">
              {loading && !items.length && <p className="notification-state">載入通知中…</p>}
              {error && <p className="notification-state error">{error}</p>}
              {!loading && !error && !items.length && (
                <p className="notification-state">目前沒有新通知</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`notification-item ${item.readAt ? "read" : "unread"}`}
                  onClick={() => void markRead(item)}
                >
                  <i aria-hidden="true" />
                  <span>
                    <b>{item.title}</b>
                    <small>{item.message}</small>
                    <time>{relativeTime(item.createdAt)}</time>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
