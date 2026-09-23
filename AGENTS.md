# AGENTS.md — meetpilot-gateway

給在這個 repo 工作的 AI agent。端點、環境變數、發碼流程在 `README.md`。跨專案的開發規範在 vault：
`/Users/vincent/AI Memory/05 - Resources/DEV-STANDARDS.md`。技術慣例以本檔為準。

**授權邊界不受本檔覆蓋。** commit、push、開 PR、merge、deploy、改 Vercel 環境變數一律要使用者當次授權。
`data/invites.json` 也走 PR，沒有 agent 可直推的例外。

## Gate

```bash
npx tsc --noEmit
npm test
```

目標分支 `main`。

## 這個 repo 的已知地雷

- 相對 import 一律寫 `.js` 副檔名（`from './invites.js'`）。`package.json` 是 `"type": "module"`，
  Vercel 把每個 TS 檔編成 ESM 跑，沒有副檔名的 import 在執行期解析不到，tsc（NodeNext）會先擋。
- 邏輯全在 `lib/`，吃參數、回 `Response`；`api/*.ts` 只接線（`lib/deps.ts` 把 `invites.json` 與
  `process.env` 接進來）。新端點照這個形狀寫，測試才不用起 server。
- 回應裡有 key 或名單，一律 `Cache-Control: no-store`（`lib/handlers.ts` 的 `json()` 已經帶）。
- 設定缺了回 500 並說缺哪個變數，不回空字串的 key、不拿空字串去簽 token。
