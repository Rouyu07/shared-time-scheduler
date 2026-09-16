# Codex 開工指令

請先完整閱讀本專案根目錄的 `SPEC.md`，並將其視為產品需求的主要依據。

本專案是一套「多人共同時間排程系統」，不是傳統預約系統。不要自行加入會員帳號、Google OAuth、Google Calendar API 或名額預約模型。

技術架構：

- Next.js + TypeScript
- PostgreSQL
- Prisma
- Linux Server
- Nginx 作為之後部署時的 Reverse Proxy

請依以下順序開始：

1. 檢查目前 repository 狀態，不要覆蓋既有有效程式。
2. 建立或整理 Next.js + TypeScript 專案結構。
3. 安裝並設定 Prisma。
4. 以 `prisma/schema.prisma` 為初始資料模型，先檢查是否與 `SPEC.md` 有矛盾。
5. 若發現規格矛盾，先列出問題，不要自行改產品規則。
6. 建立 `.env.example`，不得將真正密碼或 Token commit 到 Git。
7. 建立 PostgreSQL Migration。
8. 先完成 Schedule 建立功能：
   - 表單驗證
   - 建立 publicId
   - 建立安全 Admin Token
   - DB 僅保存 Token Hash
   - 建立成功後取得管理 Session
9. 再完成 Participant 加入與 Participant Token。
10. 再完成 Availability Grid 與儲存。
11. 再實作共同時間統計與推薦演算法，並先寫單元測試。

開發原則：

- 權限驗證必須在 Server 端。
- 使用者輸入必須在 Server 端再次驗證。
- DB schema 變更必須使用 Prisma Migration。
- 不要只靠前端隱藏按鈕做權限控制。
- 不要把 Admin Token / Participant Token 明文存進資料庫或 Log。
- 時間與時區邏輯以 `SPEC.md` 為準。
- Recommendation Algorithm 必須可測試且結果固定可重現。
- 每完成一個主要功能，更新 README 的啟動方式與必要環境變數。

開始實作前，先輸出：

1. 你理解的系統架構摘要。
2. 你準備建立／修改的檔案清單。
3. 任何你認為需要先確認的規格衝突。

若沒有衝突，再開始實作。
