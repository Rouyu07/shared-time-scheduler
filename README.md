# 合時 — 多人共同時間排程

「合時」是 REX 開發的多人共同時間排程系統。使用者可建立排程、邀請固定人數的參與者填寫 30 分鐘可行時間格，截止前可持續修改，截止後依最後儲存資料取得推薦；若最佳結果並列，參與者可投票，最後仍由建立者人工確認正式會議。

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

目前 Alembic head 為 `20260918_0003`。`0001` 建立與既有 Prisma schema 相容的資料表、索引、CHECK constraints、唯一限制及跨排程複合外鍵；`0002` 將所有 absolute instant 欄位安全轉為 PostgreSQL `timestamptz`；`0003` 以 additive migration 新增參與者範圍的站內通知表、事件去重限制與跨排程複合外鍵。Migration 路徑如下：

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

1. 建立者設定固定總人數、日期範圍、每日時段、會議長度、timezone 與必填截止時間；設定建立後鎖定。
2. 建立時自動產生建立者參與身分。公開分享連結不含管理 Token；一次性管理 Token 位於 URL fragment，交換成 HttpOnly Cookie 後立即自網址移除。
3. 參與者以獨立 Cookie 加入。額滿、重名、截止、跨排程 Token 及 Origin 均由後端驗證。
4. 每人以 30 分鐘格點選或拖曳可行時間；空白結果須再次確認後才能提交。
5. 僅在填寫截止後計算完整會議區間；全員提交只更新進度，不提前結算。推薦保留所有並列最佳候選。
6. 多個並列最佳候選啟動單選投票；投票可修改。所有目前已加入的參與者完成投票時，最後一票所在 transaction 會自動結束投票；建立者仍可提前人工結束。
7. 建立者從有效最佳候選中人工確認正式會議。系統不會自動依票數成立會議。
8. 支援留言與刪除權限、截止、取消後唯讀、Google Calendar 預填、ICS 與 VALARM。
9. 排程人數到齊、全員提交、推薦產生、投票開始／完成、待建立者確認、會議成立與排程取消會建立 PostgreSQL 站內通知；通知依參與者 Cookie 隔離，已讀狀態持久保存。
10. 頁面與 API 設為 noindex／no-store；Cookie 為 HttpOnly、SameSite=Lax，正式環境應啟用 Secure。

Desktop 的可行時間採多日期橫向矩陣，每日可全選／清除，時間格支援拖曳及方向鍵移動。Mobile 全站提供固定底部導覽：公開首頁與建立頁使用「首頁／建立／排程／更多」，排程工作區使用「總覽／時間／討論／更多」。排程工作頁使用緊湊摘要顯示活動、狀態與進度，詳細日期、時區與設定集中於「更多」。建立排程在 Mobile 依「基本資訊／日期時間／確認」分為三步，可行時間以中文單日日期切換與 chips 操作。導覽支援 iPhone safe-area，可行時間、投票與討論輸入的固定 Action Area 會位於導覽列上方，內容區保留等高捲動空間，最後一個時間格與候選皆可完整捲到 Action Area 上方。儲存可行時間後顯示無障礙 Toast。Header 的通知鈴鐺以 30 秒低頻輪詢更新未讀提示，Mobile 使用右側 drawer、Desktop 使用 panel，並支援單筆及全部已讀。正式會議建立與留言刪除皆有二次確認。建立表單會在欄位旁顯示可修正的錯誤並聚焦第一個錯誤欄位。

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

E2E 使用隔離 Cookie／Browser Context，主流程以建立者、參與者 A、參與者 B、其他參與者四個身分驗收，並另測單一最佳與截止／取消流程。涵蓋欄位錯誤聚焦、建立、三日期桌面矩陣、方向鍵操作、加入、空白提交確認、填寫、全員門檻、單一最佳不開投票、並列候選、投票固定 CTA、結束投票、正式會議二次確認、截止禁止加入、取消後唯讀、成立通知與已讀狀態、Google Calendar、ICS、Origin、私人 Token 與設定鎖定。測試只記錄並刪除本次建立的 public ID，不清除既有資料。Desktop 使用 1280px 驗收；Mobile 以 390×844 逐頁驗收首頁、建立、加入、填時間、等待、推薦、投票、確認、完成與討論，並以 360px、430px 補做 overflow 與固定導覽邊界檢查。截圖輸出至 `test-results/`。

2026-09-16 本機驗證結果：Python 9 項（含 PostgreSQL 最後提交、投票結束競態與截止規則）、TypeScript 6 項、Prisma/PostgreSQL 整合 3 項、Playwright E2E 4 項全部通過；`next build --webpack` 通過。Alembic revision 已實際由 `20260916_0001` 升為 `20260916_0002 (head)`。升版前後業務資料筆數一致：`schedules` 1、`participants` 1，其餘業務表 0；既有資料未刪除或重設。所有 19 個 instant 欄位已核對為 timezone-aware。

2026-09-17 Mobile UX 重構驗證結果：Python 9 項、TypeScript 6 項、Prisma/PostgreSQL 整合 3 項、Playwright E2E 4 項全部通過；Production Build 通過。Alembic 維持 `20260916_0002 (head)`，本輪未修改後端、schema 或 migration。

2026-09-18 Mobile UX 第二輪精修：排程工作區改用 Compact Schedule Summary，等待、推薦、投票、正式會議與討論頁縮短進入主要任務的距離；Mobile Action Area 與 Bottom Navigation 分層並保留完整內容捲動空間；日期切換改為中文日期與 chips。第二輪截圖使用 `*-mobile-v2.png` 命名，保留第一輪成果。Python 9 項、TypeScript 6 項、Prisma/PostgreSQL 整合 3 項、Playwright E2E 4 項與 Production Build 全部通過。

2026-09-18 投票與站內通知更新：全員完成投票時由最後一票的 PostgreSQL transaction 自動結束投票，但不會自動成立正式會議；建立者可提前結束，且仍須人工確認。新增持久化、身分隔離及可標記已讀的通知中心、可行時間儲存 Toast，以及 Mobile Action Area 的精確保留空間。本機實測 Python 12 項、TypeScript 6 項、Prisma/PostgreSQL 整合 4 項、Playwright E2E 4 項與 Production Build 全部通過。Alembic 已實際升至 `20260918_0003 (head)`；Migration 與測試前後既有業務資料筆數一致：`schedules` 6、`participants` 10、`availabilities` 49、`candidate_times` 8、`votes` 2、`comments` 1、`meetings` 1，未刪除或重設既有資料。

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

## 2026-09-21 截止流程與操作回饋更新

新排程截止時間必填；截止前可重複儲存，全員提交只表示進度。FastAPI 在 schedule read／相關 mutation 時以 Schedule row lock 進行冪等截止結算，保存最佳候選；單一最佳等待建立者確認，多個並列才投票。投票結束不自動成立會議。未提交成員以空可行時間納入截止結算；未加入者不列入推薦分母。既有無期限排程不補值、維持收集，既有投票及正式會議不重置。此輪無 schema／migration 變更。

建立表單 Step 01～03 的 label/control 間距為 7px，field groups 為 22px；移除日期提示但保留既有 31 天限制。成功 Toast 固定於 Header 下方、可按 × 關閉或 2.6 秒消失，不建立通知。保留右側通知抽屜與已讀操作，Desktop 也支援 ESC 關閉。

驗證結果：Python 19 項、TypeScript 單元 6 項、Prisma 相容整合 4 項、Chromium Desktop／Mobile E2E 4 項全部通過，TypeScript check 與 git diff --check 通過。專案未提供 lint script。實際檢視表單三步、頂部 Toast 與通知抽屜截圖，輸出於 test-results/。整合測試只清除自身建立的測試排程；未重設資料庫、刪除 volume 或 commit。
