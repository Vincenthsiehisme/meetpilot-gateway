# meetpilot-gateway

MeetPilot 桌面 app 的發放服務，部署在 Vercel。記錄人第一次啟動 app 時輸入邀請碼，換到一個 token；
之後 app 用 token 拿 Gemini API key 與人員名單。會議音檔、逐字稿、記錄**不經過這裡**，全部留在記錄人的電腦上，
Gemini 由 app 直接呼叫。設計與取捨在 vault 的 `MeetPilot · 跨平台打包部署`。

## 端點

| 端點 | 帶什麼 | 回什麼 |
|---|---|---|
| `POST /api/redeem` | body `{ "code": "<邀請碼>" }` | `200 { token, inviteId }`；碼不對 `401`；body 格式不對 `400` |
| `GET /api/config` | `Authorization: Bearer <token>` | `200 { geminiApiKey }`；token 無效或已撤銷 `401` |
| `GET /api/people` | `Authorization: Bearer <token>` | `200 { version: 1, rows }`；`401` 同上；名單還沒上傳 `503`；讀 Blob 失敗 `502`；名單外殼壞了 `500` |

所有回應帶 `Cache-Control: no-store`。設定缺了（見下面）回 `500` 並在 `error` 裡說缺哪個變數，
不會回一個看起來正常的空值。

## 環境變數（設在 Vercel 的 Environment Variables，不進 repo）

- `GEMINI_API_KEY`：所有記錄人共用的那一把。
- `GATEWAY_TOKEN_SECRET`：簽 token 用，至少 32 字。產生：`openssl rand -hex 32`。**換掉它等於所有已發的 token 一起作廢**，
  每位記錄人要重新輸入邀請碼。

## 名單

名單是 PII（姓名、信箱帳號、職稱、部門），**不進這個 repo**。它放在這個 Vercel 專案連接的私有 Blob store，
pathname `roster/people.json`，內容 `{ version: 1, rows }`。rows 的欄位由 MeetPilot 定義，發布也由 MeetPilot 做：

```bash
# 在 MeetPilot repo 裡，macOS 與 Windows 同一行
npx tsx scripts/publishRoster.ts <csv-path>
```

那支腳本用 MeetPilot 的 CSV 解析整份驗過，才提示貼上 Blob token（輸入不顯示、不進 shell history）再上傳。gateway 只驗外殼（版本、rows 是非空陣列、每筆是物件），
原樣轉交。讀的時候 `useCache: false`，發布完下一次請求就拿到新名單，不用重新部署。pathname 與 version
是兩個 repo 之間的契約，常數在這裡的 `lib/roster.ts` 與 MeetPilot 的 `services/rosterDocument.ts`，改一邊要改另一邊。

Blob store 要建成 **Private**（建立後不能改），並在 store 的 Projects 分頁連接到這個專案，Vercel 會自動帶
`BLOB_STORE_ID` 與 OIDC token，函式裡不用放任何 Blob 金鑰。

## 部署前必做：Deployment Protection

Vercel 每次部署都有一個專屬網址，而且一直保留。那一版的 `invites.json` 與環境變數是部署當下的快照，
所以**只要舊部署網址能匿名打開，已撤銷的 token 在那一版照樣拿得到 key 與名單**，換 secret 也救不到它
（Codex review 2026-09-24）。

所以這個專案一定要開 **Settings → Deployment Protection → Vercel Authentication，範圍選 Standard Protection**：
除了正式網域，其他部署網址都要先登入 Vercel 才打得開。開了之後要驗一次，不要只看設定頁：

```bash
curl -s https://<某一個舊部署的專屬網址>/api/config | head -c 300
```

**看內容，不要只看狀態碼**：gateway 自己對沒帶 token 的請求也回 `401`，狀態碼分不出是誰擋的。
回的是 gateway 的 JSON（`token 無效或已被撤銷`）就代表請求進到函式了，保護沒生效；回的是 Vercel 的
登入頁或驗證訊息才算擋住。正式網域打同一個網址應該回 gateway 的 JSON，那是對照組。

## 發碼與撤銷（admin）

```bash
npm run invite -- add rec-01       # 印一組邀請碼，只顯示這一次，交給那位記錄人
npm run invite -- list
npm run invite -- remove rec-01    # 撤銷
```

改的是 `data/invites.json`，**commit、push 之後 Vercel 重新部署才生效**。repo 裡只存邀請碼的 SHA-256，
不存碼本身。id 用來辨識是誰的碼，用 `rec-01` 這類代號，不要用真名或信箱，這份檔案會進 repo。

撤銷的機制：token 不設到期，每次驗證都回頭查它的 id 還在不在 `invites.json`。刪掉那一行，
那位記錄人手上的 token 在下次部署後就失效（舊部署靠上面的 Deployment Protection 擋）。token 同時綁 id 與
那一組碼，撤銷後用同一個 id 重發，舊 token 也不會復活。理由寫在 `lib/token.ts` 檔頭。

## 驗證

```bash
npx tsc --noEmit
npm test
```

兩條都要綠。CI（`.github/workflows/ci.yml`）跑同樣兩條。
