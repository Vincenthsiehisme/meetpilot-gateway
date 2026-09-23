import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Invite } from './invites.js';

/**
 * 邀請碼換到的 token：`v1.<payload>.<簽章>`，payload 是 base64url 的 `{ sub: <invite id>, rev, iat }`，
 * 簽章是 GATEWAY_TOKEN_SECRET 的 HMAC-SHA256。
 *
 * **rev 綁的是「哪一組碼」，不只是「哪個 id」。** 只綁 id 的話，撤銷 rec-01 之後用同一個 id 重發新碼，
 * 舊 token 會跟著復活（Codex review 2026-09-24 實測）。rev 取 invite hash 再雜湊一次的前 16 碼：
 * 同 id 換新碼 rev 就變，而且 token 裡看不到 invite hash 本身。
 *
 * **不設到期。** 撤銷靠兩條：驗證時回頭查 invite 還在不在清單裡（刪那一行就失效），全部作廢就換
 * GATEWAY_TOKEN_SECRET。設到期的話記錄人每隔一段時間要重新輸入邀請碼，而 app 不保留邀請碼本身，
 * 等於要 admin 重發；換來的只是「外流的 token 過一陣子自己失效」，而那件事撤銷已經做得到。
 */
const VERSION = 'v1';
export const MIN_SECRET_LENGTH = 32;

interface TokenPayload {
  sub: string;
  rev: string;
  iat: number;
}

const revisionOf = (invite: Invite): string =>
  createHash('sha256').update(invite.hash).digest('hex').slice(0, 16);

const sign = (secret: string, body: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export function issueToken(secret: string, invite: Invite, nowMs: number): string {
  const payload: TokenPayload = { sub: invite.id, rev: revisionOf(invite), iat: Math.floor(nowMs / 1000) };
  const body = `${VERSION}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${sign(secret, body)}`;
}

/** 通過回那筆 invite；簽章不對、格式不對、invite 已被刪掉或重發過一律 null，呼叫端回 401 */
export function verifyToken(secret: string, token: string, invites: Invite[]): Invite | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(secret, body));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    // 簽章對但 payload 解不開，只可能是 secret 外流後被人手造；當成無效 token
    return null;
  }
  const { sub, rev } = (payload ?? {}) as { sub?: unknown; rev?: unknown };
  if (typeof sub !== 'string' || typeof rev !== 'string') return null;
  const invite = invites.find((candidate) => candidate.id === sub);
  if (invite === undefined || revisionOf(invite) !== rev) return null;
  return invite;
}
