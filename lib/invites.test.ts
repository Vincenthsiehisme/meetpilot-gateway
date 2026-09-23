import { describe, expect, it } from 'vitest';
import {
  INVITE_ALPHABET,
  findInviteByCode,
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
  parseInvites,
} from './invites.js';

describe('generateInviteCode', () => {
  it('四組四碼、只用字元集裡的字、每次不同', () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      for (const ch of code.replace(/-/g, '')) expect(INVITE_ALPHABET).toContain(ch);
    }
  });

  it('字元集沒有容易看錯的 0 O 1 I L', () => {
    for (const ch of '0O1IL') expect(INVITE_ALPHABET).not.toContain(ch);
  });
});

describe('normalizeInviteCode／hashInviteCode', () => {
  it('大小寫、空白、連字號不影響雜湊：手打的碼跟發出去的碼算出同一個值', () => {
    const issued = 'ABCD-EFGH-JKMN-PQRS';
    expect(normalizeInviteCode(' abcd efgh-jkmn pqrs ')).toBe('ABCDEFGHJKMNPQRS');
    expect(hashInviteCode(' abcd efgh-jkmn pqrs ')).toBe(hashInviteCode(issued));
  });

  it('雜湊寫死期望值（另外用 node -e 對正規化後的字串算 sha256 得出）：換算法就紅，已經發出去的碼會全部對不上', () => {
    expect(hashInviteCode('ABCD-EFGH-JKMN-PQRS')).toBe(
      'f598056127fcd4387651a49b3a4235d8ce50d71f4091068df51511cfc10f388f',
    );
  });
});

describe('parseInvites', () => {
  const ok = { id: 'rec-01', hash: 'a'.repeat(64) };

  it('合法清單原樣回來', () => {
    expect(parseInvites([ok])).toEqual([ok]);
    expect(parseInvites([])).toEqual([]);
  });

  it.each([
    ['不是陣列', {}, /必須是陣列/],
    ['id 有大寫', [{ ...ok, id: 'Rec-01' }], /id "Rec-01" 不合法/],
    ['id 是空字串', [{ ...ok, id: '' }], /id "" 不合法/],
    ['hash 不是 64 碼 hex', [{ ...ok, hash: 'abc' }], /hash 不是 64 碼小寫 hex/],
    ['id 重複', [ok, { ...ok, hash: 'b'.repeat(64) }], /id「rec-01」重複/],
    ['hash 重複', [ok, { ...ok, id: 'rec-02' }], /hash 跟前面某一筆重複/],
  ])('%s 就拋', (_label, raw, message) => {
    expect(() => parseInvites(raw)).toThrow(message);
  });
});

describe('findInviteByCode', () => {
  it('找得到對的那筆，找不到回 null', () => {
    const invites = [{ id: 'rec-01', hash: hashInviteCode('AAAA-BBBB-CCCC-DDDD') }];
    expect(findInviteByCode(invites, 'aaaa-bbbb-cccc-dddd')?.id).toBe('rec-01');
    expect(findInviteByCode(invites, 'AAAA-BBBB-CCCC-DDDE')).toBeNull();
  });
});
