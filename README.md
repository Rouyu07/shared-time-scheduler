# 合時 — 多人共同時間排程

「合時」是 REX 開發的多人共同時間排程系統。使用者可建立排程、邀請固定人數的參與者填寫 30 分鐘可行時間格，待全員加入且全員提交後取得推薦；若最佳結果並列，參與者可投票，最後仍由建立者人工確認正式會議。

## 目前架構

```text
Browser
  → Next.js 16 / React 19 / TypeScript / Tailwind CSS
  → 同源 /api/schedules/* rewrite
  → FastAPI / Pydantic / SQLAlchemy
  → PostgreSQL 17
       ↑
    Alembic migrations
```

Python 依賴由 `uv`、`pyproject.toml` 與 `uv.lock` 管理。Docker Compose 在開發環境啟動 `app`、`backend`、`db` 三個服務。Next.js 既有 API Route、Server Action、Prisma schema、Prisma migrations 與服務程式仍保留，供安全遷移、相容性測試及回溯使用；目前瀏覽器的排程 API 由 Next.js rewrite 轉送至 FastAPI。

## 開發啟動

先將 `.env.example` 複製為 `.env`，填入自己的值。不要覆蓋既有 `.env`，也不要將它加入版本控制。

| 變數 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 密碼，建議使用不含 URL 保留字的長隨機值 |
| `TOKEN_PEPPER` | Cookie／Token HMAC 密鑰，至少 32 字元；變更後舊 Token 將失效 |
| `APP_URL` | 瀏覽器使用的完整來源；本機為 `http://localhost:3000` |
| `DATABASE_URL` | 主機端 Prisma CLI 的 PostgreSQL 連線字串 |
| `BACKEND_URL` | 主機端 Next.js 要轉送的 FastAPI 位置；Compose 會覆寫為 `http://backend:8000` |
| `COOKIE_SECURE` | 本機 HTTP 使用 `false`；正式 HTTPS 必須使用 `true` |

在專案根目錄執行：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail 80 backend app
```

開啟 <http://localhost:3000>。後端健康檢查位於容器內的 `/health`，FastAPI 不直接暴露到主機網路。

停止服務但保留資料：

```bash
docker compose stop
```

PostgreSQL 使用 `pgdata` named volume。請勿執行 `docker compose down -v`，也不要刪除該 volume。

## 資料庫與 Migration

目前 Alembic head 為 `20260916_0002`。`0001` 建立與既有 Prisma schema 相容的資料表、索引、CHECK constraints、唯一限制及跨排程複合外鍵；`0002` 將所有 absolute instant 欄位安全轉為 PostgreSQL `timestamptz`。Migration 路徑如下：

- 空資料庫：由 SQLAlchemy metadata 建立完整 schema。
- 已有 Prisma schema：驗證必要資料表後登記 Alembic revision，不刪表、不重建資料，也不刪除 Prisma migration。
- 舊的 `timestamp without time zone`：明確以既有值為 UTC 轉換，保留同一時間點；已是 `timestamptz` 的欄位會略過。

啟動 backend 時會執行：

```bash
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

正式環境執行 Migration 前，先建立 PostgreSQL 備份並在副本演練。不可使用 `prisma migrate reset`、`prisma db push --force-reset`、DROP database 或刪除 volume。Prisma migrations 位於 `prisma/migrations/`，Alembic migrations 位於 `alembic/versions/`。

所有業務時間以 timezone-aware datetime／UTC instant 儲存，並依排程的 IANA timezone 顯示。參與者加入、提交、投票、確認與取消等寫入在 PostgreSQL transaction 中鎖定 Schedule row，以避免額滿加入、重複確認及狀態切換競爭。

## 已實作產品流程

1. 建立者設定固定總人數、日期範圍、每日時段、會議長度、timezone 與選填截止時間；設定建立後鎖定。
2. 建立時自動產生建立者參與身分。公開分享連結不含管理 Token；一次性管理 Token 位於 URL fragment，交換成 HttpOnly Cookie 後立即自網址移除。
3. 參與者以獨立 Cookie 加入。額滿、重名、截止、跨排程 Token 及 Origin 均由後端驗證。
4. 每人以 30 分鐘格點選或拖曳可行時間；空白結果須再次確認後才能提交。
5. 僅在預設人數全部加入且全部提交後計算完整會議區間。推薦保留所有並列最佳候選。
6. 多個並列最佳候選啟動單選投票；投票可修改，建立者人工結束投票。
7. 建立者從有效最佳候選中人工確認正式會議。系統不會自動依票數成立會議。
8. 支援留言與刪除權限、截止、取消後唯讀、Google Calendar 預填、ICS 與 VALARM。
9. 頁面與 API 設為 noindex／no-store；Cookie 為 HttpOnly、SameSite=Lax，正式環境應啟用 Secure。

Desktop 的可行時間採多日期橫向矩陣，每日可全選／清除，時間格支援拖曳及方向鍵移動。Mobile 提供單日切換與固定底部導覽「排程／填時間／成員／更多」，可行時間與投票的 Sticky CTA 都會避開底部導覽。投票及正式會議狀態會顯示通知點；使用者進入相應結果頁後會在該瀏覽器標記已讀。頁面輪詢發現會議成立時會顯示通知對話框。正式會議建立與留言刪除皆有二次確認。建立表單會在欄位旁顯示可修正的錯誤並聚焦第一個錯誤欄位。

## 測試

```bash
# FastAPI、演算法、ICS 與資料庫整合
docker compose exec -T backend uv run python -m pytest backend/tests

# TypeScript 與共用演算法
docker compose exec -T app npm run typecheck
docker compose exec -T app npm test

# 保留的 Prisma 相容性與 PostgreSQL 併發測試
docker compose exec -T app npm run test:integration

# 四個隔離 Cookie／Browser Context 的 Chromium E2E
docker compose exec -T app npx playwright test
```

E2E 使用隔離 Cookie／Browser Context，主流程以建立者、參與者 A、參與者 B、其他參與者四個身分驗收，並另測單一最佳與截止／取消流程。涵蓋欄位錯誤聚焦、建立、三日期桌面矩陣、方向鍵操作、加入、空白提交確認、填寫、全員門檻、單一最佳不開投票、並列候選、投票固定 CTA、結束投票、正式會議二次確認、截止禁止加入、取消後唯讀、成立通知與已讀狀態、Google Calendar、ICS、Origin、私人 Token 與設定鎖定。測試只記錄並刪除本次建立的 public ID，不清除既有資料。桌機與 390×844 觸控版截圖輸出至 `test-results/`。

2026-09-16 本機驗證結果：Python 9 項（含 PostgreSQL 最後提交、投票結束競態與截止規則）、TypeScript 6 項、Prisma/PostgreSQL 整合 3 項、Playwright E2E 4 項全部通過；`next build --webpack` 通過。Alembic revision 已實際由 `20260916_0001` 升為 `20260916_0002 (head)`。升版前後業務資料筆數一致：`schedules` 1、`participants` 1，其餘業務表 0；既有資料未刪除或重設。所有 19 個 instant 欄位已核對為 timezone-aware。

正式建置前先停止開發中的 app，避免兩個程序同時寫入 `.next`：

```bash
docker compose stop app
docker compose run --rm app npm run build
docker compose up -d app
```

## 主要目錄

- `backend/`：FastAPI 路由、Pydantic schema、SQLAlchemy models、交易與權限邏輯
- `alembic/`：SQLAlchemy schema migration
- `src/app/`、`src/components/`：Next.js UI、Responsive 介面與同源 API proxy
- `src/lib/`：既有 TypeScript／Prisma 實作與共用前端型別，遷移期間保留
- `prisma/`：既有 Prisma schema 與 migrations，未刪除
- `backend/tests/`：Python 單元與整合測試
- `tests/`：TypeScript、Prisma/PostgreSQL 與 Playwright 測試
- `deploy/`：Linux／Nginx 部署範例；目前尚未對外部署

## 部署注意事項

`deploy/nginx.conf.example` 提供 Nginx 反向代理與 API 限流範例。正式部署仍需配置網域、TLS、`APP_URL`、`COOKIE_SECURE=true`、備份與還原演練、程序監控及固定版本映像。不可公開 `next dev` 或 Uvicorn reload 模式。

目前頁面每 10 秒輪詢狀態，尚未使用 WebSocket。Google Calendar 採預填連結，沒有 OAuth 或代替使用者寫入行事曆。尚未在 Safari、Firefox 或實體手機硬體驗收；自動化手機驗收使用 Chromium 390×844 觸控環境。
