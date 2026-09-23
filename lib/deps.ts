import { get } from '@vercel/blob';
import rawInvites from '../data/invites.json' with { type: 'json' };
import { parseInvites } from './invites.js';
import { GatewayDeps } from './handlers.js';
import { ROSTER_PATHNAME } from './roster.js';

// 模組載入時就驗清單：打錯的 invites.json 讓部署一開始就壞，不是等到有人換 token 才發現
const invites = parseInvites(rawInvites);

// useCache: false 直接讀原始儲存。預設走 CDN 快取，覆寫後最多 60 秒內還會讀到舊名單；
// 每台 app 只在啟動時讀一次，量很小，慢一點換一致性划算
async function readRoster(): Promise<string | null> {
  const result = await get(ROSTER_PATHNAME, { access: 'private', useCache: false });
  if (result === null) return null;
  if (result.statusCode !== 200) throw new Error(`Blob 回 ${result.statusCode}，預期 200`);
  return new Response(result.stream).text();
}

export const productionDeps = (): GatewayDeps => ({ invites, env: process.env, now: Date.now, readRoster });
