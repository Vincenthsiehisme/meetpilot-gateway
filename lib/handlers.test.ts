import { describe, expect, it, vi } from 'vitest';
import { GatewayDeps, handleConfig, handlePeople, handleRedeem } from './handlers.js';
import { hashInviteCode } from './invites.js';
import { issueToken, verifyToken } from './token.js';

const SECRET = 's'.repeat(32);
const CODE = 'AAAA-BBBB-CCCC-DDDD';
const NOW = Date.UTC(2026, 8, 24, 0, 0, 0);
// 假名單：欄位名照 MeetPilot 的 RosterPersonImport，但 gateway 不解讀內容，只驗外殼
const ROSTER_TEXT = JSON.stringify({ version: 1, rows: [{ employeeId: '0001', displayName: '測試人', title: null, email: 'test@example.com', department: null, aliases: [] }] });

const INVITE = { id: 'rec-01', hash: hashInviteCode(CODE) };

const deps = (overrides: Partial<GatewayDeps> = {}): GatewayDeps => ({
  invites: [INVITE],
  env: { GATEWAY_TOKEN_SECRET: SECRET, GEMINI_API_KEY: 'gemini-test-key' },
  now: () => NOW,
  readRoster: async () => ROSTER_TEXT,
  ...overrides,
});

const redeem = (body: unknown, d = deps()) =>
  handleRedeem(
    new Request('https://gw.test/api/redeem', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    d,
  );

const getConfig = (authorization: string | null, d = deps()) =>
  handleConfig(
    new Request('https://gw.test/api/config', {
      headers: authorization === null ? {} : { authorization },
    }),
    d,
  );

describe('POST /api/redeem', () => {
  it('對的碼換到 token，token 驗得回同一個 invite；手打的大小寫與空白不影響', async () => {
    const res = await redeem({ code: ' aaaa bbbb-cccc dddd ' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.inviteId).toBe('rec-01');
    expect(verifyToken(SECRET, body.token, deps().invites)?.id).toBe('rec-01');
  });

  it('碼不對回 401，不發 token', async () => {
    const res = await redeem({ code: 'AAAA-BBBB-CCCC-DDDE' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: '邀請碼不對或已被撤銷' });
  });

  it.each([
    ['不是 JSON', 'not json'],
    ['沒有 code', {}],
    ['code 不是字串', { code: 123 }],
    ['code 是空白', { code: '   ' }],
  ])('%s 回 400', async (_label, body) => {
    expect((await redeem(body)).status).toBe(400);
  });

  it('GATEWAY_TOKEN_SECRET 沒設或太短回 500 並說缺哪個，不拿空字串去簽', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const secret of [undefined, '', 'short']) {
        const res = await redeem({ code: CODE }, deps({ env: { GATEWAY_TOKEN_SECRET: secret, GEMINI_API_KEY: 'k' } }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toContain('GATEWAY_TOKEN_SECRET');
      }
    } finally {
      error.mockRestore();
    }
  });
});

describe('GET /api/config', () => {
  const token = issueToken(SECRET, INVITE, NOW);

  it('有效 token 拿到 Gemini key，回應不准快取', async () => {
    const res = getConfig(`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ geminiApiKey: 'gemini-test-key' });
  });

  it.each([
    ['沒帶 Authorization', null],
    ['不是 Bearer', `Basic ${token}`],
    ['token 被改過一個字', `Bearer ${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`],
    ['別的 secret 簽的', `Bearer ${issueToken('x'.repeat(32), INVITE, NOW)}`],
    ['格式不對', 'Bearer not-a-token'],
  ])('%s 回 401', async (_label, authorization) => {
    const res = getConfig(authorization);
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('gemini-test-key');
  });

  it('撤銷：invite 從清單刪掉之後，它先前換到的 token 立刻失效', () => {
    expect(getConfig(`Bearer ${token}`, deps({ invites: [] })).status).toBe(401);
  });

  it('撤銷後用同一個 id 重發新碼，舊 token 不會復活', () => {
    const reissued = [{ id: 'rec-01', hash: hashInviteCode('EEEE-FFFF-GGGG-HHHH') }];
    expect(getConfig(`Bearer ${token}`, deps({ invites: reissued })).status).toBe(401);
    expect(getConfig(`Bearer ${issueToken(SECRET, reissued[0], NOW)}`, deps({ invites: reissued })).status).toBe(200);
  });

  it('換掉 GATEWAY_TOKEN_SECRET，所有舊 token 一起失效', () => {
    const rotated = deps({ env: { GATEWAY_TOKEN_SECRET: 'r'.repeat(32), GEMINI_API_KEY: 'k' } });
    expect(getConfig(`Bearer ${token}`, rotated).status).toBe(401);
  });

  it('GEMINI_API_KEY 沒設回 500 並說缺哪個，不回空字串的 key', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = getConfig(`Bearer ${token}`, deps({ env: { GATEWAY_TOKEN_SECRET: SECRET, GEMINI_API_KEY: '  ' } }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain('GEMINI_API_KEY');
    } finally {
      error.mockRestore();
    }
  });
});

describe('GET /api/people', () => {
  const token = issueToken(SECRET, INVITE, NOW);
  const getPeople = (authorization: string | null, d = deps()) =>
    handlePeople(
      new Request('https://gw.test/api/people', { headers: authorization === null ? {} : { authorization } }),
      d,
    );
  const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      return await run();
    } finally {
      error.mockRestore();
    }
  };

  it('有效 token 拿到 Blob 上的名單原樣內容，回應不准快取', async () => {
    const res = await getPeople(`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(JSON.parse(ROSTER_TEXT));
  });

  it('沒有 token 或已撤銷回 401，而且根本不去讀 Blob', async () => {
    const readRoster = vi.fn(async () => ROSTER_TEXT);
    expect((await getPeople(null, deps({ readRoster }))).status).toBe(401);
    expect((await getPeople(`Bearer ${token}`, deps({ readRoster, invites: [] }))).status).toBe(401);
    expect(readRoster).not.toHaveBeenCalled();
  });

  it('Blob 上還沒有名單回 503，不回一份空清單', async () => {
    const res = await getPeople(`Bearer ${token}`, deps({ readRoster: async () => null }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('roster/people.json');
  });

  it('讀 Blob 失敗回 502 並帶原因', async () => {
    const res = await quietly(() =>
      getPeople(`Bearer ${token}`, deps({ readRoster: async () => { throw new Error('store suspended'); } })),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('store suspended');
  });

  it.each([
    ['不是 JSON', 'not json', /不是 JSON/],
    ['version 不對', JSON.stringify({ version: 2, rows: [{}] }), /version 是 2/],
    ['rows 是空陣列', JSON.stringify({ version: 1, rows: [] }), /rows 不是非空陣列/],
    ['rows 裡有非物件', JSON.stringify({ version: 1, rows: [{}, 'x'] }), /rows\[1\] 不是物件/],
  ])('名單外殼壞了（%s）回 500，不把壞東西轉交出去', async (_label, text, message) => {
    const res = await quietly(() => getPeople(`Bearer ${token}`, deps({ readRoster: async () => text })));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(message);
  });
});
