import { createHash, randomInt } from 'node:crypto';

/**
 * 邀請碼：每位記錄人一組，admin 用 `scripts/invite.mjs add <id>` 產生，只顯示一次。
 * repo 裡只存雜湊（data/invites.json），刪掉那一行 push 就撤銷，已發出去的 token 也跟著失效
 * （token 驗證時會回頭查這份清單，見 token.ts）。
 *
 * 字元集拿掉容易看錯的 0/O、1/I/L，16 碼約 79 bits。碼是隨機產生的高熵值，所以雜湊用
 * SHA-256 就夠，不需要 bcrypt 那種為了低熵密碼設計的慢雜湊。
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 16;

export interface Invite {
  id: string;
  hash: string;
}

const INVITE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** 使用者手打的碼：大小寫不分、分隔用的空白與連字號不算 */
export const normalizeInviteCode = (raw: string): string => raw.toUpperCase().replace(/[\s-]/g, '');

export const hashInviteCode = (code: string): string =>
  createHash('sha256').update(normalizeInviteCode(code)).digest('hex');

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code.match(/.{4}/g)!.join('-');
}

/**
 * 驗 data/invites.json 的形狀。壞掉就在載入當下拋，不要讓一份打錯的清單安靜變成「誰都換不到 token」
 * 或「重複的 id 讓撤銷只撤掉一半」。
 */
export function parseInvites(raw: unknown): Invite[] {
  if (!Array.isArray(raw)) throw new Error('data/invites.json 必須是陣列');
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  return raw.map((entry, index) => {
    const where = `data/invites.json 第 ${index} 筆`;
    if (typeof entry !== 'object' || entry === null) throw new Error(`${where} 不是物件`);
    const { id, hash } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !INVITE_ID.test(id)) {
      throw new Error(`${where} 的 id ${JSON.stringify(id)} 不合法（小寫英數與連字號，1 到 40 字）`);
    }
    if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) throw new Error(`${where}（${id}）的 hash 不是 64 碼小寫 hex`);
    if (seenIds.has(id)) throw new Error(`${where} 的 id「${id}」重複`);
    if (seenHashes.has(hash)) throw new Error(`${where}（${id}）的 hash 跟前面某一筆重複`);
    seenIds.add(id);
    seenHashes.add(hash);
    return { id, hash };
  });
}

export const findInviteByCode = (invites: Invite[], code: string): Invite | null => {
  const hash = hashInviteCode(code);
  return invites.find((invite) => invite.hash === hash) ?? null;
};
