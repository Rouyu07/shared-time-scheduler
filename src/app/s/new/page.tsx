"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
export default function NewSchedule() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    publicId: string;
    adminLink: string;
  } | null>(null);
  const [copied, setCopied] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      setCreated(await api("", "POST", data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(location.origin + value);
      setCopied(label);
    } catch {
      setCopied("請選取下方連結並手動複製");
    }
  }
  if (created)
    return (
      <main className="narrow">
        <div className="success-icon">✓</div>
        <div className="eyebrow">準備好了</div>
        <h1>邀請大家，找個好時間。</h1>
        <p className="muted">你已取得管理權限，並加入為第一位參與者。</p>
        <section className="card stack">
          <h2>分享給參與者</h2>
          <p className="share-explanation">
            朋友開啟後可以輸入自己的名字加入。你在同一瀏覽器開啟時，仍會保留建立者身分。
          </p>
          <input
            aria-label="分享連結"
            readOnly
            value={
              typeof window === "undefined"
                ? ""
                : location.origin + `/s/${created.publicId}`
            }
          />
          <button
            onClick={() => copy(`/s/${created.publicId}`, "已複製分享連結")}
          >
            複製分享連結
          </button>
        </section>
        <section className="card stack">
          <h2>請保存你的私人管理連結</h2>
          <p>
            只會在這裡顯示一次。請勿分享；管理 Cookie
            遺失後，可用此連結取回管理權限。
          </p>
          <input
            aria-label="私人管理連結"
            readOnly
            value={
              typeof window === "undefined"
                ? ""
                : location.origin + created.adminLink
            }
          />
          <button
            className="secondary"
            onClick={() => copy(created.adminLink, "已複製管理連結")}
          >
            複製私人管理連結
          </button>
        </section>
        <p role="status">{copied}</p>
        <Link
          className="button primary"
          href={`/s/${created.publicId}/availability`}
        >
          填寫我的可行時間 →
        </Link>
      </main>
    );
  return (
    <main className="narrow creation-layout">
      <aside className="creation-intro">
        <Link className="back" href="/">
          ← 回首頁
        </Link>
        <div className="eyebrow">
          <span className="dot" /> PLAN SOMETHING GOOD
        </div>
        <h1>
          把時間對上，
          <br />
          <span>把大家聚在一起。</span>
        </h1>
        <p className="intro-description">
          從一個簡單的邀請開始。
          <br />
          剩下的時間交集，讓合時幫你整理。
        </p>
        <ol className="creation-steps">
          <li>
            <span>01</span>
            <div>
              <b>設定這次相聚</b>
              <p>填入主題、人數與可選日期。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <b>把連結分享出去</b>
              <p>朋友輸入自己的名字，填寫時間。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <b>一起決定好時間</b>
              <p>全員提交後推薦，並列時再投票。</p>
            </div>
          </li>
        </ol>
        <div className="creation-note">
          <span>↗</span>
          <div>
            <b>不用註冊，也能一起安排。</b>
            <p>人數包含你自己。建立後設定會鎖定，送出前記得確認。</p>
          </div>
        </div>
        <div className="intro-signature">
          THOUGHTFULLY BUILT BY <b>REX</b>
        </div>
      </aside>
      <form onSubmit={submit} className="card form">
        <h2>
          <span className="section-number">01</span> 這次要一起做什麼？
        </h2>
        <label>
          排程名稱
          <input
            name="title"
            placeholder="例如：期末專題討論"
            required
            maxLength={120}
          />
        </label>
        <div className="form-row">
          <label>
            你的顯示名稱
            <input
              name="creatorName"
              placeholder="大家怎麼稱呼你？"
              required
              maxLength={40}
            />
          </label>
          <label>
            總人數（包含你）
            <input
              name="expectedParticipants"
              type="number"
              min={1}
              max={100}
              defaultValue={4}
              required
            />
          </label>
        </div>
        <label>
          補充說明 <span className="optional">選填</span>
          <textarea
            name="description"
            placeholder="討論主題、需要準備的東西……"
            maxLength={5000}
            rows={3}
          />
        </label>
        <hr />
        <h2>
          <span className="section-number">02</span> 哪些日期與時間可以選？
        </h2>
        <div className="form-row">
          <label>
            開始日期
            <input name="startDate" type="date" required />
          </label>
          <label>
            結束日期
            <input name="endDate" type="date" required />
          </label>
        </div>
        <p className="field-hint">最多 31 天；每日時間不跨午夜。</p>
        <div className="form-row">
          <label>
            每日開始
            <input
              name="dailyStartTime"
              type="time"
              defaultValue="18:00"
              required
            />
          </label>
          <label>
            每日結束
            <input
              name="dailyEndTime"
              type="time"
              defaultValue="22:00"
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            會議時長
            <select name="durationMinutes" defaultValue="60">
              {[30, 60, 90, 120, 150, 180, 240].map((n) => (
                <option value={n} key={n}>
                  {n} 分鐘
                </option>
              ))}
            </select>
          </label>
          <label>
            時區
            <input
              name="timezone"
              defaultValue="Asia/Taipei"
              list="timezones"
              required
            />
            <datalist id="timezones">
              {[
                "Asia/Taipei",
                "Asia/Tokyo",
                "Asia/Hong_Kong",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
                "UTC",
              ].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        </div>
        <label>
          填寫截止時間 <span className="optional">選填，依上述時區</span>
          <input name="deadline" type="datetime-local" />
        </label>
        <div className="notice">
          建立後設定不可修改。全員提交後才會推薦；若多個最佳時段並列，系統會開啟投票並鎖定可行時間。
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary large" disabled={busy}>
          {busy ? "建立中…" : "建立排程，取得分享連結 ↗"}
        </button>
      </form>
    </main>
  );
}
