# 合時｜Codex 開始執行指示

請接手開發「合時」多人共同時間排程系統。

## 開始前必讀

在修改任何程式碼之前，先完整閱讀並理解：

1.  `README.md`
2.  `docs/SPEC.md`
3.  `docs/UI_UX_SPEC.md`
4.  `docs/ui-reference.png`
5.  `package.json`
6.  `compose.yaml`
7.  既有 Prisma schema 與 migrations
8.  Python / FastAPI 相關檔案（若已有）
9.  `pyproject.toml`、`uv.lock`（若已有）
10. `src/`
11. `tests/`
12. 現有前端 API 呼叫與資料庫結構

## 文件優先順序

1.  `docs/SPEC.md`：產品規則、技術架構、安全、資料庫、Migration
    與商業邏輯。
2.  `docs/UI_UX_SPEC.md`：UI、UX、Responsive、互動、狀態、文案與視覺驗收。
3.  `docs/ui-reference.png`：Desktop／Mobile 視覺方向參考。

若介面示意圖與文字規格衝突，以文字規格為準。若 `SPEC.md` 與
`UI_UX_SPEC.md` 出現會影響產品流程、權限、資料安全或 Migration
的實質矛盾，先詢問使用者，不要自行猜測。

## 品牌與名稱

-   系統正式名稱：`合時`
-   開發團隊／品牌識別：`REX`
-   不再使用「共時 Gather」或 Gather 作為產品名稱。
-   REX Logo 使用專案既有
    `public/rex-logo.png`，不得自行重繪、拉伸或以文字替代。

## 工作方式

先分析目前專案，不要直接重寫，也不要刪除或破壞既有有效程式與資料。

開始時先簡述：

1.  現有前端架構。
2.  現有後端架構。
3.  現有資料庫與 Migration 狀態。
4.  哪些功能仍使用 Next.js API Routes、Server Actions、Prisma
    或其他舊後端。
5.  準備如何安全遷移至 Next.js + TypeScript + Tailwind
    CSS、FastAPI、PostgreSQL + SQLAlchemy + Alembic。
6.  預計修改哪些檔案或模組。
7.  是否存在資料 Migration 或相容性風險。
8.  是否有需要使用者決策、且會影響產品流程的問題。

若沒有需要使用者決策的阻礙，不要只停在分析或建議階段，直接繼續：

**分析 → 小步實作 → Migration → 自動化測試 → 啟動 → Desktop／Mobile
瀏覽器 E2E 驗收 → 修正 → README 更新**

## 不可違反事項

-   不得刪除既有 PostgreSQL 資料、Docker Volume 或有效 Migration。
-   不得輸出、覆蓋或提交 `.env` Secret。
-   不得以 reset / DROP Database 作為一般 Migration 手段。
-   不得只在前端實作核心權限、截止時間、排程狀態或安全驗證。
-   不得用靜態假資料冒充後端功能完成。
-   不得用同一份 Cookie / Browser Context 假裝不同參與者完成 E2E。
-   不得宣稱尚未實際執行的測試、Migration、部署或瀏覽器驗收已完成。
-   所有產品流程、演算法、權限、安全、併發與測試細節，必須依
    `docs/SPEC.md`。
-   所有 UI／UX、Responsive 與互動驗收細節，必須依
    `docs/UI_UX_SPEC.md`。

## 完成後回報

最後提供：

-   完成項目
-   修改內容
-   Migration 狀態
-   自動化測試結果
-   Desktop／Mobile 實際瀏覽器驗收結果
-   啟動方式
-   README 更新內容
-   尚未完成項目
-   已知問題
-   可查看的成果
