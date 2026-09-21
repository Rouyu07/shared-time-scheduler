"use client";
import Link from "next/link";
import DesktopIdentity from "@/components/desktop-identity";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { ScheduleView } from "@/lib/service";
import { formatRange } from "@/lib/scheduling";
import { googleCalendar } from "@/lib/calendar";
import Toast, { type ToastMessage } from "@/components/toast";

type PendingMeeting = {
  startAt: string;
  location: string;
  meetingUrl: string;
  description: string;
  reminderMinutes: number | null;
};

export default function ScheduleScreen({
  id,
  section,
}: {
  id: string;
  section: string;
}) {
  const [s, setS] = useState<ScheduleView | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set()),
    [day, setDay] = useState(0),
    [dirty, setDirty] = useState(false);
  const [joinName, setJoinName] = useState(""),
    [comment, setComment] = useState(""),
    [copyText, setCopyText] = useState("");
  const [voteChoice, setVoteChoice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false),
    [confirmEmptyAvailability, setConfirmEmptyAvailability] = useState(false),
    [showConfirmedNotice, setShowConfirmedNotice] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<
      ScheduleView["comments"][number] | null
    >(null),
    [pendingMeeting, setPendingMeeting] = useState<PendingMeeting | null>(null);
  const drag = useRef<{ value: boolean; active: boolean }>({
    value: false,
    active: false,
  });
  const dirtyRef = useRef(false);
  const previousStatus = useRef<string | null>(null);
  const load = useCallback(
    async (reset = false) => {
      const next: ScheduleView = await api(`/${id}`);
      if (
        previousStatus.current !== null &&
        previousStatus.current !== "CONFIRMED" &&
        next.status === "CONFIRMED"
      ) {
        setShowConfirmedNotice(true);
      }
      previousStatus.current = next.status;
      setS(next);
      setVoteChoice((current) => current ?? next.myVote ?? null);
      if (reset || !dirtyRef.current) {
        setSelected(new Set(next.me?.slots.map(Date.parse) ?? []));
        setDirty(false);
        dirtyRef.current = false;
      }
      return next;
    },
    [id],
  );
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const token = new URLSearchParams(location.hash.slice(1)).get("token");
        if (token && section === "manage") {
          history.replaceState(null, "", location.pathname);
          await api(`/${id}/admin-session`, "POST", { token });
        }
        if (active) await load(true);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void initialize();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    }, 10000);
    const endDrag = () => {
      drag.current.active = false;
    };
    window.addEventListener("pointerup", endDrag);
    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [id, section, load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [section]);
  async function run(
    action: string,
    method = "POST",
    body?: unknown,
    success = "已儲存",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/${id}/${action}`, method, body);
      await load(action === "availability" || action === "join");
      setMessage(success);
      if (action === "availability") {
        setToast({
          id: Date.now(),
          kind: "success",
          title: "✓ 已儲存可行時間",
          detail: "你的時間已更新",
        });
      }
      window.dispatchEvent(new Event("heshi:notifications:refresh"));
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (action === "availability") {
        setToast({
          id: Date.now(),
          kind: "error",
          title: "儲存失敗，請稍後再試",
        });
      }
      await load().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!s)
    return (
      <main className="narrow">
        <h1>{error ? "暫時無法開啟排程" : "正在整理大家的時間…"}</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Link href="/">回首頁</Link>
      </main>
    );
  const submitted = s.participants.filter((p) => p.submitted).length;
  const closed = s.status === "CANCELLED",
    confirmed = s.status === "CONFIRMED";
  const deadlinePassed = !!s.deadline && Date.parse(s.deadline) <= Date.now();
  const canEdit = s.status === "COLLECTING" && !deadlinePassed;
  const tabs = [
    ["overview", "總覽"],
    ["availability", "我的時間"],
    ["results", "共同時間"],
    ["discussion", "討論"],
    ...(s.status === "VOTING" ? [["vote", "時段投票"]] : []),
    ...(confirmed ? [["confirmed", "正式會議"]] : []),
    ...(s.isAdmin || section === "manage" ? [["manage", "管理排程"]] : []),
  ];
  const range = (a: string, b: string) => formatRange(a, b, s.timezone);
  const humanDay = (value: string, includeYear = false) => {
    const [year, month, date] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "UTC",
      ...(includeYear ? { year: "numeric" as const } : {}),
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date(Date.UTC(year, month - 1, date, 12)));
  };
  const timezoneLabel = s.timezone === "Asia/Taipei" ? "台北時間" : s.timezone;
  const formatStamp = (value: string) =>
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: s.timezone,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  const statusLabel = closed
    ? "已取消"
    : confirmed
      ? "會議已確認"
      : s.status === "VOTING"
        ? s.votingClosedAt
          ? "投票已結束・待確認"
          : "投票進行中"
        : s.best.length > 0
          ? "最佳時段待確認"
          : "收集時間中";
  const compactProgress =
    s.status === "VOTING"
      ? `${s.voted} / ${s.expectedParticipants} 已投票`
      : confirmed
        ? `${s.expectedParticipants} 人皆已完成`
        : `${submitted} / ${s.expectedParticipants} 已提交`;
  const setSlot = (stamp: number, value: boolean) => {
    setSelected((old) => {
      const n = new Set(old);
      if (value) n.add(stamp);
      else n.delete(stamp);
      return n;
    });
    setDirty(true);
    dirtyRef.current = true;
  };
  const setDaySlots = (value: boolean, targetDay = day) => {
    const stamps = s.grid[targetDay].slots.map((slot) => Date.parse(slot.startAt));
    setSelected((old) => {
      const next = new Set(old);
      stamps.forEach((stamp) => (value ? next.add(stamp) : next.delete(stamp)));
      return next;
    });
    setDirty(true);
    dirtyRef.current = true;
  };
  const slotButton = (
    slot: ScheduleView["grid"][number]["slots"][number],
    dayIndex: number,
    slotIndex: number,
  ) => {
    const stamp = Date.parse(slot.startAt),
      checked = selected.has(stamp),
      endLabel = new Intl.DateTimeFormat("zh-TW", {
        timeZone: s.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(stamp + 30 * 60 * 1000)),
      accessibleLabel = `${s.grid[dayIndex].day} ${slot.label} 至 ${endLabel}，${
        checked ? "可行，按下取消" : "不可行，按下選擇"
      }`;
    return (
      <button
        type="button"
        key={slot.startAt}
        data-slot={stamp}
        data-day-index={dayIndex}
        data-slot-index={slotIndex}
        aria-pressed={checked}
        aria-label={accessibleLabel}
        title={`${slot.label}–${endLabel}`}
        disabled={!canEdit || busy}
        className={`time-slot ${checked ? "selected" : ""}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          drag.current = { active: true, value: !checked };
          setSlot(stamp, !checked);
        }}
        onClick={(e) => {
          if (e.detail === 0) setSlot(stamp, !checked);
        }}
        onKeyDown={(e) => {
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
            return;
          e.preventDefault();
          const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
          const nextDay = vertical
            ? dayIndex
            : Math.max(
                0,
                Math.min(s.grid.length - 1, dayIndex + (e.key === "ArrowLeft" ? -1 : 1)),
              );
          const nextSlot = vertical
            ? Math.max(
                0,
                Math.min(
                  s.grid[nextDay].slots.length - 1,
                  slotIndex + (e.key === "ArrowUp" ? -1 : 1),
                ),
              )
            : Math.min(slotIndex, s.grid[nextDay].slots.length - 1);
          e.currentTarget
            .closest(".availability-picker")
            ?.querySelector<HTMLButtonElement>(
              `[data-day-index="${nextDay}"][data-slot-index="${nextSlot}"]:not(:disabled)`,
            )
            ?.focus();
        }}
      >
        {slot.label}
        <span>{checked ? "✓ 可參加" : "選擇"}</span>
      </button>
    );
  };
  const resultCard = (r: ScheduleView["results"][number], i: number) => (
    <article
      key={r.startAt}
      className={`result-card ${i === 0 ? "top-result" : ""}`}
    >
      <span className="rank">{String(i + 1).padStart(2, "0")}</span>
      <div className="result-main">
        <h3>{range(r.startAt, r.endAt)}</h3>
        <p>
          {r.unavailable.length
            ? `無法參加：${r.unavailable.join("、")}`
            : "全員可參加"}
        </p>
      </div>
      <div className="score">
        {r.count}
        <span> / {r.total}</span>
        <small>人可參加</small>
      </div>
    </article>
  );
  const meeting = s.meeting;
  const meetingPanel =
    meeting && confirmed ? (
      <section className="card meeting-card">
        <div className="eyebrow">會議已成立</div>
        <h2>{s.title}</h2>
        <p className="meeting-time">{range(meeting.startAt, meeting.endAt)}</p>
        <p className="meeting-meta">
          {timezoneLabel} · {s.durationMinutes} 分鐘
        </p>
        {meeting.location && <p>地點：{meeting.location}</p>}
        {meeting.meetingUrl && (
          <p>
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              開啟線上會議 ↗
            </a>
          </p>
        )}
        {meeting.description && (
          <p className="prewrap">{meeting.description}</p>
        )}
        <div className="actions">
          <a
            className="button primary"
            target="_blank"
            rel="noopener noreferrer"
            href={googleCalendar({
              uid: `${id}@shared-time`,
              title: s.title,
              timezone: s.timezone,
              ...meeting,
            })}
          >
            加入 Google Calendar ↗
          </a>
          <a
            className="button secondary"
            href={`/api/schedules/${id}/calendar`}
          >
            下載 ICS ↓
          </a>
        </div>
        <p className="field-hint">
          {meeting.reminderMinutes != null
            ? `.ics 包含提前 ${meeting.reminderMinutes} 分鐘提醒。`
            : "未設定行事曆提醒。"}{" "}
          Google Calendar 開啟後請自行儲存活動及設定提醒。
        </p>
      </section>
    ) : null;
  const pendingBest = pendingMeeting
    ? s.best.find(
        (candidate) =>
          Date.parse(candidate.startAt) === Date.parse(pendingMeeting.startAt),
      )
    : null;
  return (
    <main
      className={`workspace section-${section} ${!s.me ? "guest-workspace" : ""}`}
    >
      <Toast message={toast} onDismiss={() => setToast(null)} />
      {confirmEmptyAvailability && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="empty-availability-title"
          >
            <p className="eyebrow">再次確認</p>
            <h2 id="empty-availability-title">提交空白可行時間？</h2>
            <p>
              你目前沒有選取任何時段。提交後會記錄為「沒有可參加的時間」，仍會計入已提交人數。
            </p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setConfirmEmptyAvailability(false)}
              >
                返回選擇
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setConfirmEmptyAvailability(false);
                  await run(
                    "availability",
                    "PUT",
                    { slots: [] },
                    "已提交空白可行時間",
                  );
                }}
              >
                確認提交空白結果
              </button>
            </div>
          </section>
        </div>
      )}
      {showConfirmedNotice && s.meeting && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog success-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmed-notice-title"
          >
            <p className="eyebrow">IT’S A DATE</p>
            <h2 id="confirmed-notice-title">會議已成立！</h2>
            <p>{range(s.meeting.startAt, s.meeting.endAt)}</p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setShowConfirmedNotice(false)}
              >
                稍後查看
              </button>
              <Link
                className="button primary"
                href={`/s/${id}/confirmed`}
                onClick={() => setShowConfirmedNotice(false)}
              >
                查看正式會議 →
              </Link>
            </div>
          </section>
        </div>
      )}
      {commentToDelete && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-comment-title"
          >
            <p className="eyebrow">刪除留言</p>
            <h2 id="delete-comment-title">確定刪除這則留言？</h2>
            <p>
              {commentToDelete.name}：{commentToDelete.content}
            </p>
            <div className="actions">
              <button
                autoFocus
                className="secondary"
                onClick={() => setCommentToDelete(null)}
              >
                保留留言
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  const target = commentToDelete;
                  if (
                    await run(
                      `comments/${target.id}`,
                      "DELETE",
                      undefined,
                      "留言已刪除",
                    )
                  ) {
                    setCommentToDelete(null);
                  }
                }}
              >
                確定刪除
              </button>
            </div>
          </section>
        </div>
      )}
      {pendingMeeting && pendingBest && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog meeting-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-meeting-title"
          >
            <p className="eyebrow">最終確認</p>
            <h2 id="confirm-meeting-title">成立這場正式會議？</h2>
            <p className="meeting-confirm-time">
              {range(pendingBest.startAt, pendingBest.endAt)}
            </p>
            <p>
              {s.timezone} · {pendingBest.count}/{pendingBest.total} 人可完整參加
            </p>
            {pendingMeeting.location && <p>地點：{pendingMeeting.location}</p>}
            <p className="field-hint">
              確認後時間不可修改，所有可行時間、推薦與投票都會保持唯讀。
            </p>
            <div className="actions">
              <button
                autoFocus
                className="secondary"
                onClick={() => setPendingMeeting(null)}
              >
                返回檢查
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      "confirm",
                      "POST",
                      pendingMeeting,
                      "會議已確認！請查看正式會議頁",
                    )
                  ) {
                    setPendingMeeting(null);
                  }
                }}
              >
                確認成立會議 ✓
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="workspace-top">
        <Link href="/" className="back">
          ← 所有相聚，從這裡開始
        </Link>
        <button
          className="secondary compact workspace-share"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}/s/${id}`);
              setMessage("已複製分享連結");
            } catch {
              setCopyText(`${location.origin}/s/${id}`);
            }
          }}
        >
          分享排程 ↗
        </button>
      </div>
      {copyText && <input aria-label="分享連結" readOnly value={copyText} />}
      <section className="compact-schedule-summary" aria-label="排程摘要">
        <div>
          <h1>{s.title}</h1>
          <p><span className="dot" />{statusLabel}</p>
        </div>
        <strong>{compactProgress}</strong>
      </section>
      {(s.me || s.isAdmin) && (
        <section className="identity-banner" aria-label="目前瀏覽身分">
          <span className="identity-avatar">
            {(s.me?.name ?? s.creatorName).slice(0, 1)}
          </span>
          <div className="identity-main">
            <span className="identity-caption">目前瀏覽身分</span>
            <strong>
              {s.me?.name ?? s.creatorName}
              <span className="identity-role">
                {s.isAdmin ? "建立者" : "參與者"}
              </span>
            </strong>
          </div>
          <details className="identity-help">
            <summary>為什麼沒有重新輸入名字？</summary>
            <p>
              這個瀏覽器記得你在此排程的身分，所以開啟分享連結時會自動辨識為你。分享連結本身不包含管理權限。
            </p>
            <p>
              想測試另一位參與者？請用無痕視窗或另一個瀏覽器開啟分享連結，就能輸入不同的名字。無痕視窗關閉後不會保留該參與身分；正式參與請使用固定瀏覽器。
            </p>
            <p>
              只要分享「分享排程」取得的連結，其他人就會以自己的身分加入。私人管理連結請自己保存。
            </p>
          </details>
        </section>
      )}
      {(s.me || s.isAdmin) && <DesktopIdentity name={s.me?.name ?? s.creatorName} role={s.isAdmin ? "建立者" : "參與者"} />}
      <div className="schedule-heading">
        <div>
          <span className="pill">
            <span className="dot" />
            {statusLabel}
          </span>
          <h1>{s.title}</h1>
          <p className="muted">
            {s.creatorName} 發起 · {s.startDate} — {s.endDate} ·{" "}
            {s.durationMinutes} 分鐘 · {s.timezone}
          </p>
        </div>
        <button
          className="secondary compact heading-share"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}/s/${id}`);
              setMessage("已複製分享連結");
            } catch {
              setCopyText(`${location.origin}/s/${id}`);
            }
          }}
        >
          分享排程 ↗
        </button>
      </div>
      {s.description && <p className="description prewrap">{s.description}</p>}
      <section className="stats">
        <div>
          <span>本次固定人數</span>
          <strong>
            {s.expectedParticipants}
            <small>人</small>
          </strong>
        </div>
        <div>
          <span>已加入</span>
          <strong>
            {s.participants.length}
            <small> / {s.expectedParticipants}</small>
          </strong>
        </div>
        <div>
          <span>已提交時間</span>
          <strong>
            {submitted}
            <small> / {s.expectedParticipants}</small>
          </strong>
          <div className="progress">
            <i
              style={{
                width: `${(submitted / s.expectedParticipants) * 100}%`,
              }}
            />
          </div>
        </div>
        <div>
          <span>填寫截止</span>
          <strong className="deadline">
            {s.deadline
              ? new Intl.DateTimeFormat("zh-TW", {
                  timeZone: s.timezone,
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(s.deadline))
              : "未設定"}
            <small>{deadlinePassed ? "已截止" : s.timezone}</small>
          </strong>
        </div>
      </section>
      <nav className="tabs" aria-label="排程功能">
        {tabs.map(([route, label]) => (
          <Link
            aria-current={section === route ? "page" : undefined}
            className={section === route ? "active" : ""}
            key={route}
            href={`/s/${id}${route === "overview" ? "" : `/${route}`}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav className="mobile-bottom-nav" aria-label="手機排程導覽">
        <Link
          href={`/s/${id}`}
          aria-current={
            ["overview", "results", "vote", "confirmed"].includes(section)
              ? "page"
              : undefined
          }
        >
          <span className="nav-icon" aria-hidden="true">⌂</span>
          總覽
        </Link>
        <Link
          href={`/s/${id}/availability`}
          aria-current={section === "availability" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">✓</span>
          時間
        </Link>
        <Link
          href={`/s/${id}/discussion`}
          aria-current={section === "discussion" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">▢</span>
          討論
        </Link>
        <Link
          href={`/s/${id}/more`}
          aria-current={section === "more" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">•••</span>
          更多
        </Link>
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {closed && (
        <div className="notice">
          此排程已取消，所有資料僅供查看。若曾加入個人行事曆，請自行刪除該活動。
        </div>
      )}
      {deadlinePassed && !confirmed && !closed && (
        <div className="notice">
          填寫已截止，可行時間已鎖定，推薦依截止前最後儲存的資料計算。
        </div>
      )}
      {!s.me && (
        <section className="card join-panel">
          <div>
            <h2>加入這個排程</h2>
            <p>
              {canEdit && s.participants.length < s.expectedParticipants
                ? "輸入顯示名稱即可加入，不用註冊。"
                : "目前無法加入。若你已加入卻看不到自己的身分，請使用原本的瀏覽器與裝置。"}
            </p>
          </div>
          {canEdit && s.participants.length < s.expectedParticipants && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await run(
                  "join",
                  "POST",
                  { name: joinName },
                  "已加入，請到「我的時間」填寫",
                );
              }}
              className="actions"
            >
              <input
                aria-label="加入用顯示名稱"
                placeholder="你的顯示名稱"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                required
                maxLength={40}
              />
              <button disabled={busy}>加入排程 →</button>
            </form>
          )}
          <p className="mobile-join-meta">
            {s.expectedParticipants} 人排程 · {humanDay(s.startDate)}～{humanDay(s.endDate)} · {s.durationMinutes} 分鐘
          </p>
        </section>
      )}
      {section === "overview" && (
        <>
          <div className={`two-columns overview-layout ${!s.results.length ? "waiting-overview" : ""}`}>
            <div>
              {meetingPanel ?? (
                <section className="card overview-recommendation">
                  <div className="section-title">
                    <h2>推薦的好時間</h2>
                    <Link href={`/s/${id}/results`}>完整結果 ↗</Link>
                  </div>
                  {s.results.length ? (
                    <>
                      {s.results.slice(0, 3).map(resultCard)}
                      <p className="field-hint">
                        {s.best.length === 1
                          ? "唯一最佳時段，等待建立者確認。"
                          : `共有 ${s.best.length} 個並列最佳時段，已開啟投票。`}
                      </p>
                      {s.status === "VOTING" && (
                        <Link className="button primary" href={`/s/${id}/vote`}>
                          查看時段投票 →
                        </Link>
                      )}
                    </>
                  ) : (
                    <div className="empty">
                      <span>◷</span>
                      <h3>好時間，值得等每一個人。</h3>
                      <p>
                        還需 {s.expectedParticipants - submitted} 人提交，
                        <br />
                        截止前仍可修改，截止後才會顯示最佳時段。
                      </p>
                      {s.me && canEdit && (
                        <Link
                          className="button primary"
                          href={`/s/${id}/availability`}
                        >
                          填寫我的時間 →
                        </Link>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
            <aside className="card overview-members">
              <h2>這次一起的夥伴</h2>
              <p className="field-hint">
                包含發起者，共 {s.expectedParticipants} 人
              </p>
              <ul className="people">
                {s.participants.map((p, i) => (
                  <li key={p.id}>
                    <span className={`avatar color-${i % 3}`}>
                      {p.name.slice(0, 1)}
                    </span>
                    <span>
                      {p.name}
                      {p.id === s.me?.id && <small>（你）</small>}
                    </span>
                    <span className={p.submitted ? "submitted" : "muted"}>
                      {p.submitted ? "✓ 已提交" : "待填寫"}
                    </span>
                  </li>
                ))}
              </ul>
              {s.participants.length < s.expectedParticipants && (
                <p className="field-hint">
                  還有 {s.expectedParticipants - s.participants.length}{" "}
                  位夥伴尚未加入
                </p>
              )}
              {!s.results.length && (
                <p className="mobile-waiting-note">
                  所有人提交後，系統會整理共同可行時間。
                </p>
              )}
            </aside>
          </div>
        </>
      )}
      {(section === "overview" || section === "discussion") && (
          <section className={`card comments ${section === "overview" ? "overview-comments" : "discussion-page"}`}>
            <h2>
              留個訊息 <span className="count">{s.comments.length}</span>
            </h2>
            {s.comments.length === 0 && (
              <p className="muted">關於這次相聚，有什麼想先說的？</p>
            )}
            {s.comments.map((c) => (
              <article key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <span className="role-badge">{c.role}</span>
                  <time>
                    {new Intl.DateTimeFormat("zh-TW", {
                      timeZone: s.timezone,
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(c.createdAt))}
                  </time>
                  {!closed && !confirmed && (s.isAdmin || c.participantId === s.me?.id) && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setCommentToDelete(c)}
                    >
                      刪除
                    </button>
                  )}
                </div>
                <p className="prewrap">{c.content}</p>
              </article>
            ))}
            {s.me && !closed && !confirmed && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run(
                      "comments",
                      "POST",
                      { content: comment },
                      "留言已送出",
                    )
                  )
                    setComment("");
                }}
              >
                <textarea
                  aria-label="留言內容"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  required
                rows={1}
                  placeholder="留下你的想法…"
                />
                <div className="actions">
                  <span className="field-hint">{comment.length} / 500</span>
                  <button disabled={busy || !comment.trim()}>送出留言</button>
                </div>
              </form>
            )}
          </section>
      )}
      {section === "availability" && s.me && (
        <section className="card">
          <div className="section-title">
            <div>
              <h2>{s.me.name} 的可行時間</h2>
              <p className="muted">
                每格 30 分鐘。點選或拖曳時間格，選出你可以參加的時間。
              </p>
            </div>
            <span className="pill">{selected.size} 格已選</span>
          </div>
          {!canEdit && (
            <p className="notice">可行時間已鎖定，以下顯示你最後提交的內容。</p>
          )}
          <div className="availability-picker availability-mobile">
          <div className="day-navigation">
            <button
              className="date-arrow"
              aria-label="前一天"
              disabled={day === 0}
              onClick={() => setDay(day - 1)}
            >
              ‹
            </button>
            <div className="current-day">
              <strong>{humanDay(s.grid[day].day)}</strong>
              <small>{s.grid[day].day.slice(0, 4)} 年</small>
            </div>
            <button
              className="date-arrow"
              aria-label="後一天"
              disabled={day === s.grid.length - 1}
              onClick={() => setDay(day + 1)}
            >
              ›
            </button>
          </div>
          <div className="date-chips" aria-label="選擇日期">
            {s.grid.map((group, index) => (
              <button
                type="button"
                className={index === day ? "active" : ""}
                aria-pressed={index === day}
                key={group.day}
                onClick={() => setDay(index)}
              >
                {humanDay(group.day)}
              </button>
            ))}
          </div>
          <div className="day-bulk-actions">
            <button
              className="text-button"
              disabled={!canEdit || busy}
              onClick={() => setDaySlots(true)}
            >
              全選此日
            </button>
            <button
              className="text-button"
              disabled={!canEdit || busy}
              onClick={() => setDaySlots(false)}
            >
              清除此日
            </button>
          </div>
          <div
            className="availability-grid"
            onPointerMove={(e) => {
              if (!drag.current.active || !canEdit || busy) return;
              const el = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest<HTMLElement>("[data-slot]");
              if (el?.dataset.slot)
                setSlot(Number(el.dataset.slot), drag.current.value);
            }}
            onPointerCancel={() => {
              drag.current.active = false;
            }}
          >
            {s.grid[day].slots.map((slot, slotIndex) =>
              slotButton(slot, day, slotIndex),
            )}
          </div>
          {!s.grid[day].slots.length && (
            <p className="notice">
              此日沒有有效時間格，可能位於日光節約時間切換範圍。
            </p>
          )}
          </div>
          <div
            className="availability-picker availability-desktop"
            onPointerMove={(e) => {
              if (!drag.current.active || !canEdit || busy) return;
              const el = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest<HTMLElement>("[data-slot]");
              if (el?.dataset.slot)
                setSlot(Number(el.dataset.slot), drag.current.value);
            }}
            onPointerCancel={() => {
              drag.current.active = false;
            }}
          >
            <div className="availability-matrix" aria-label="所有日期可行時間矩陣">
              {s.grid.map((group, dayIndex) => (
                <section className="availability-day-column" key={group.day}>
                  <header>
                    <time dateTime={group.day}>{group.day}</time>
                    <div>
                      <button
                        type="button"
                        className="text-button"
                        disabled={!canEdit || busy}
                        onClick={() => setDaySlots(true, dayIndex)}
                      >
                        全選
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={!canEdit || busy}
                        onClick={() => setDaySlots(false, dayIndex)}
                      >
                        清除
                      </button>
                    </div>
                  </header>
                  <div className="availability-day-slots">
                    {group.slots.map((slot, slotIndex) =>
                      slotButton(slot, dayIndex, slotIndex),
                    )}
                    {!group.slots.length && <p className="muted">無有效時間格</p>}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="save-bar">
            <div>
              <b>
                {dirty
                  ? "有尚未提交的變更"
                  : s.me.submitted
                    ? "✓ 已提交可行時間"
                    : "尚未提交"}
              </b>
              <p>即使沒有可行時間，也請提交空白結果。</p>
              {s.me.submittedAt && !dirty && (
                <p className="last-updated">最後提交：{formatStamp(s.me.submittedAt)}</p>
              )}
            </div>
            <button
              disabled={!canEdit || busy}
              onClick={() => {
                if (selected.size === 0) {
                  setConfirmEmptyAvailability(true);
                  return;
                }
                void run(
                  "availability",
                  "PUT",
                  {
                    slots: [...selected].map((t) => new Date(t).toISOString()),
                  },
                  "可行時間已提交",
                );
              }}
            >
              {busy ? "提交中…" : "儲存我的可行時間 →"}
            </button>
          </div>
          <div className="mobile-action-reserved-space" aria-hidden="true" />
        </section>
      )}
      {section === "results" && (
        <section className="card results-page">
          <h2>完整共同時間</h2>
          <p className="muted results-explanation">
            依 {s.durationMinutes} 分鐘完整區間計算；日期先後只影響顯示順序。
          </p>
          {s.results.length ? (
            <div className="results-list">
              <p className="mobile-result-group">最佳推薦</p>
              {resultCard(s.results[0], 0)}
              {s.results.length > 1 && (
                <p className="mobile-result-group other">其他共同時間</p>
              )}
              {s.results.slice(1).map((result, index) => resultCard(result, index + 1))}
            </div>
          ) : (
            <div className="empty">
              <h3>等待填寫截止</h3>
              <p>
                目前 {submitted} / {s.expectedParticipants} 人已提交，截止前仍可修改。
              </p>
            </div>
          )}
        </section>
      )}
      {section === "members" && (
        <section className="card">
          <h2>成員提交狀態</h2>
          <p className="muted">
            已加入 {s.participants.length}／{s.expectedParticipants} 人，已提交{" "}
            {submitted}／{s.expectedParticipants} 人。
          </p>
          <ul className="people">
            {s.participants.map((p, i) => (
              <li key={p.id}>
                <span className={`avatar color-${i % 3}`}>
                  {p.name.slice(0, 1)}
                </span>
                <span>
                  {p.name}
                  {p.id === s.me?.id && <small>（你）</small>}
                </span>
                <span className={p.submitted ? "submitted" : "muted"}>
                  {p.submitted
                    ? `✓ 已提交${p.submittedAt ? ` · ${formatStamp(p.submittedAt)}` : ""}`
                    : "待填寫"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {section === "more" && (
        <section className="card stack">
          <h2>更多</h2>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/s/${id}`,
                );
                setMessage("已複製分享連結");
              } catch {
                setCopyText(`${location.origin}/s/${id}`);
              }
            }}
          >
            複製分享連結
          </button>
          <div className="notice">
            <b>排程資訊</b>
            <p>
              {humanDay(s.startDate, true)}～{humanDay(s.endDate, true)}
            </p>
            <p>
              每日 {s.dailyStartTime}–{s.dailyEndTime} · {s.durationMinutes} 分鐘 · {timezoneLabel}
            </p>
            <p>建立後基本設定已鎖定。</p>
          </div>
          {s.isAdmin && (
            <Link className="button secondary" href={`/s/${id}/manage`}>
              管理與取消排程 →
            </Link>
          )}
          <Link className="button secondary" href={`/s/${id}`}>
            查看留言 →
          </Link>
        </section>
      )}
      {section === "vote" && (
        <section className="card">
          <h2>{s.votingClosedAt ? "投票結果" : "哪個好時間，是你的首選？"}</h2>
          <p className="muted">
            單選偏好投票。投票代表最偏好的時間，不代表重新填寫可行時間。
          </p>
          <p>
            已投票 {s.voted} 人 · 尚未投票 {s.expectedParticipants - s.voted} 人
          </p>
          <div className="voting-list">
            {s.candidates.map((c, i) => (
              <article
                className={`vote-card ${voteChoice === c.id ? "chosen" : ""}`}
                key={c.id}
                onClick={() => {
                  if (s.me && s.status === "VOTING" && !s.votingClosedAt && !busy)
                    setVoteChoice(c.id);
                }}
              >
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <div className="result-main">
                  <h3>{range(c.startAt, c.endAt)}</h3>
                  <p>
                    {c.votes} 票{voteChoice === c.id ? " · 你的選擇" : ""}
                  </p>
                  <div className="progress">
                    <i
                      style={{
                        width: `${(c.votes / s.expectedParticipants) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <button
                  className={voteChoice === c.id ? "primary" : "secondary"}
                  disabled={
                    busy || !s.me || s.status !== "VOTING" || !!s.votingClosedAt
                  }
                  onClick={() => setVoteChoice(c.id)}
                >
                  {voteChoice === c.id ? "✓ 已選擇" : "選這個時段"}
                </button>
              </article>
            ))}
          </div>
          {s.candidates.length === 0 && (
            <p className="notice">
              目前沒有投票。填寫截止後有多個並列最佳時段時才會啟動。
            </p>
          )}
          {s.votingClosedAt && (
            <>
              <p className="notice">
                {s.isAdmin
                  ? "投票已完成，請確認正式時間。"
                  : "投票已完成，等待建立者確認會議時間。"}
              </p>
              {s.isAdmin && (
                <Link className="button primary" href={`/s/${id}/manage`}>
                  確認正式時間 →
                </Link>
              )}
            </>
          )}
          {!s.votingClosedAt && s.status === "VOTING" && s.me && (
            <div className="vote-submit-bar">
              <span>
                {voteChoice
                  ? s.myVote
                    ? "可修改選擇後更新投票"
                    : "已選擇一個偏好時段"
                  : "請先選擇一個偏好時段"}
              </span>
              <button
                disabled={busy || !voteChoice || voteChoice === s.myVote}
                onClick={() =>
                  voteChoice &&
                  run("vote", "POST", { candidateId: voteChoice }, "投票已更新")
                }
              >
                {busy ? "送出中…" : s.myVote ? "更新投票" : "送出投票"}
              </button>
            </div>
          )}
          <div className="mobile-action-reserved-space" aria-hidden="true" />
        </section>
      )}
      {section === "confirmed" &&
        (meetingPanel ?? (
          <section className="card">
            <h2>{closed ? "排程已取消" : "會議尚未確認"}</h2>
            <p>最終時間需要由建立者確認。</p>
          </section>
        ))}
      {section === "manage" && (
        <>
          {!s.isAdmin ? (
            <section className="card">
              <h2>需要管理權限</h2>
              <p>
                請使用建立時保存的私人管理連結。若連結與管理 Cookie
                都遺失，無法恢復管理權限。
              </p>
            </section>
          ) : (
            <>
              <section className="card">
                <h2>管理排程</h2>
                <p className="notice">
                  排程設定建立後已鎖定。你可以結束投票、確認會議或取消排程。
                </p>
                {s.status === "VOTING" && !s.votingClosedAt && (
                  <div className="manage-action">
                    <div>
                      <h3>結束這次投票</h3>
                      <p>
                        目前 {s.voted} / {s.expectedParticipants}{" "}
                        人投票。結束後不能再投票，票數會保留。
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          "close-voting",
                          "POST",
                          undefined,
                          "投票已結束，可以確認最終會議",
                        )
                      }
                    >
                      結束投票
                    </button>
                  </div>
                )}
                {s.best.length > 0 &&
                  !confirmed &&
                  !closed &&
                  (s.status !== "VOTING" || s.votingClosedAt) && (
                    <form
                      className="form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        setPendingMeeting({
                          startAt: String(data.startAt),
                          location: String(data.location ?? ""),
                          meetingUrl: String(data.meetingUrl ?? ""),
                          description: String(data.description ?? ""),
                          reminderMinutes:
                            data.reminderMinutes === ""
                              ? null
                              : Number(data.reminderMinutes),
                        });
                      }}
                    >
                      <h3>確認最終會議</h3>
                      <label>
                        最終時段
                        <select name="startAt" required>
                          {s.best.map((b) => (
                            <option key={b.startAt} value={b.startAt}>
                              {range(b.startAt, b.endAt)}（{b.count}/{b.total}{" "}
                              人可參加
                              {s.candidates.length
                                ? `，${s.candidates.find((c) => Date.parse(c.startAt) === Date.parse(b.startAt))?.votes ?? 0} 票`
                                : ""}
                              ）
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="form-row">
                        <label>
                          會議地點
                          <input name="location" maxLength={200} />
                        </label>
                        <label>
                          線上會議連結
                          <input
                            name="meetingUrl"
                            type="url"
                            placeholder="https://"
                            maxLength={2048}
                          />
                        </label>
                      </div>
                      <label>
                        會議說明
                        <textarea
                          name="description"
                          maxLength={5000}
                          rows={3}
                        />
                      </label>
                      <label>
                        行事曆提醒
                        <select name="reminderMinutes" defaultValue="30">
                          <option value="">不提醒</option>
                          <option value="30">提前 30 分鐘</option>
                          <option value="60">提前 1 小時</option>
                          <option value="1440">提前 1 天</option>
                        </select>
                      </label>
                      <p className="field-hint">
                        確認後會議時間不可修改。系統不會自動替你決定。
                      </p>
                      <button disabled={busy}>檢查並確認正式會議 →</button>
                    </form>
                  )}
                {!s.best.length && !closed && (
                  <p className="muted">填寫截止並產生推薦後，才能確認會議。</p>
                )}
                {confirmed && (
                  <Link className="button primary" href={`/s/${id}/confirmed`}>
                    查看正式會議 →
                  </Link>
                )}
              </section>
              {!closed && (
                <section className="card danger-panel">
                  <h3>取消排程</h3>
                  <p>
                    取消後所有資料唯讀，不能恢復。已加入個人行事曆的活動需要參與者自行刪除。
                  </p>
                  {confirmCancel ? (
                    <div className="actions">
                      <b>確定取消這個排程？</b>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          run("cancel", "POST", undefined, "排程已取消")
                        }
                      >
                        確定取消
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setConfirmCancel(false)}
                      >
                        保留排程
                      </button>
                    </div>
                  ) : (
                    <button
                      className="danger-outline"
                      onClick={() => setConfirmCancel(true)}
                    >
                      取消此排程
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
