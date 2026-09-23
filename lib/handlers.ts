import { Invite, findInviteByCode } from './invites.js';
import { MIN_SECRET_LENGTH, issueToken, verifyToken } from './token.js';
import { ROSTER_PATHNAME, parseRosterDocument } from './roster.js';

/**
 * 三支端點的邏輯。api/*.ts 只負責把真的 invites 清單、process.env、Blob 讀取接進來，
 * 這裡全部吃參數、回 Response，測試不用起 server。
 */
export interface GatewayDeps {
  invites: Invite[];
  env: Record<string, string | undefined>;
  now: () => number;
  /** 讀 Blob 上的名單原文；檔案不存在回 null，其他失敗（權限、網路）直接拋 */
  readRoster: () => Promise<string | null>;
}

// 回應裡有金鑰或名單，任何一層都不准快取
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

class ConfigError extends Error {}

function requireEnv(env: GatewayDeps['env'], key: string, minLength = 1): string {
  const value = (env[key] ?? '').trim();
  if (value.length < minLength) {
    throw new ConfigError(
      minLength > 1 ? `${key} 沒設或短於 ${minLength} 字` : `${key} 沒設`,
    );
  }
  return value;
}

// 設定缺了是部署的錯，不是呼叫端的錯：回 500 並說缺哪個，不要回一個看起來正常的空值
function configErrorResponse(err: unknown): Response {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`[gateway] 設定不完整：${err.message}`);
  return json(500, { error: `gateway 設定不完整：${err.message}` });
}

function withConfigErrors(run: () => Response): Response {
  try {
    return run();
  } catch (err) {
    return configErrorResponse(err);
  }
}

function authenticate(request: Request, deps: GatewayDeps): Invite | null {
  const secret = requireEnv(deps.env, 'GATEWAY_TOKEN_SECRET', MIN_SECRET_LENGTH);
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  if (match === null) return null;
  return verifyToken(secret, match[1], deps.invites);
}

const UNAUTHORIZED = { error: 'token 無效或已被撤銷，請重新輸入邀請碼' };

export async function handleRedeem(request: Request, deps: GatewayDeps): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'request body 要是 JSON：{ "code": "<邀請碼>" }' });
  }
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || code.trim() === '') {
    return json(400, { error: 'request body 要是 JSON：{ "code": "<邀請碼>" }' });
  }
  return withConfigErrors(() => {
    const secret = requireEnv(deps.env, 'GATEWAY_TOKEN_SECRET', MIN_SECRET_LENGTH);
    const invite = findInviteByCode(deps.invites, code);
    if (invite === null) return json(401, { error: '邀請碼不對或已被撤銷' });
    return json(200, { token: issueToken(secret, invite, deps.now()), inviteId: invite.id });
  });
}

export function handleConfig(request: Request, deps: GatewayDeps): Response {
  return withConfigErrors(() => {
    if (authenticate(request, deps) === null) return json(401, UNAUTHORIZED);
    return json(200, { geminiApiKey: requireEnv(deps.env, 'GEMINI_API_KEY') });
  });
}

export async function handlePeople(request: Request, deps: GatewayDeps): Promise<Response> {
  try {
    if (authenticate(request, deps) === null) return json(401, UNAUTHORIZED);
  } catch (err) {
    return configErrorResponse(err);
  }

  let text: string | null;
  try {
    text = await deps.readRoster();
  } catch (err) {
    const reason = (err as Error | null)?.message ?? String(err);
    console.error(`[gateway] 讀 Blob 上的 ${ROSTER_PATHNAME} 失敗：${reason}`);
    return json(502, { error: `gateway 讀不到名單（Blob）：${reason}` });
  }
  // 沒上傳過跟上傳了空名單是兩件事：前者是還沒設定好，app 要能分辨，不能拿到一份空清單當成「公司沒有人」
  if (text === null) {
    return json(503, { error: `名單還沒上傳（Blob 上沒有 ${ROSTER_PATHNAME}），請 admin 先執行發布` });
  }
  try {
    return json(200, parseRosterDocument(text));
  } catch (err) {
    const reason = (err as Error).message;
    console.error(`[gateway] 名單格式壞了：${reason}`);
    return json(500, { error: `名單格式壞了：${reason}` });
  }
}
