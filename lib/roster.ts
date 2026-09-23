/**
 * 名單放在私有 Vercel Blob store 的 `roster/people.json`，不進 git：388 人的姓名、信箱帳號、職稱、部門是
 * PII，git 歷史會永久留著每一版，離職的人刪不乾淨（vault DEV-STANDARDS〈憑證與安全〉）。
 *
 * 文件形狀 `{ version: 1, rows: [...] }`。rows 每一筆的欄位由 MeetPilot 定義（它的 `parseRosterCsv` 產出），
 * 上傳也由 MeetPilot 的發布腳本做，解析規則只有那一份。gateway 不解讀 rows 內容，只驗外殼：
 * 版本對、rows 是非空陣列、每筆是物件。外殼都不對的東西不轉交出去，讓錯在這裡就現形，
 * 而不是每一台 app 各自匯入失敗。
 */
export const ROSTER_PATHNAME = 'roster/people.json';
export const ROSTER_VERSION = 1;

export interface RosterDocument {
  version: typeof ROSTER_VERSION;
  rows: Record<string, unknown>[];
}

export function parseRosterDocument(text: string): RosterDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${ROSTER_PATHNAME} 不是 JSON：${(err as Error).message}`);
  }
  const doc = raw as { version?: unknown; rows?: unknown } | null;
  if (doc === null || typeof doc !== 'object') throw new Error(`${ROSTER_PATHNAME} 不是物件`);
  if (doc.version !== ROSTER_VERSION) {
    throw new Error(`${ROSTER_PATHNAME} 的 version 是 ${JSON.stringify(doc.version)}，這版 gateway 只認 ${ROSTER_VERSION}`);
  }
  if (!Array.isArray(doc.rows) || doc.rows.length === 0) throw new Error(`${ROSTER_PATHNAME} 的 rows 不是非空陣列`);
  doc.rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`${ROSTER_PATHNAME} 的 rows[${index}] 不是物件`);
    }
  });
  return { version: ROSTER_VERSION, rows: doc.rows as Record<string, unknown>[] };
}
