// admin 用：發、撤、列邀請碼。改的是 data/invites.json，改完 commit、push，Vercel 重新部署後生效。
//
//   npx tsx scripts/invite.ts add <id>      產生一組邀請碼，只印這一次；repo 只留雜湊
//   npx tsx scripts/invite.ts remove <id>   撤銷：這個 id 換到的 token 在下次部署後全部失效
//   npx tsx scripts/invite.ts list          列出目前有哪些 id
//
// id 用來辨識是誰的碼（例如 rec-01），不要用真名或信箱：這份檔案會進 repo。
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Invite, generateInviteCode, hashInviteCode, parseInvites } from '../lib/invites.js';

const INVITES = fileURLToPath(new URL('../data/invites.json', import.meta.url));

const save = (invites: Invite[]): void => {
  // 先過一次同一份驗證再寫，寫壞的清單不落地
  parseInvites(invites);
  const tmp = `${INVITES}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(invites, null, 2)}\n`);
  renameSync(tmp, INVITES);
};

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const [command, id] = process.argv.slice(2);
const invites = parseInvites(JSON.parse(readFileSync(INVITES, 'utf8')));

if (command === 'list') {
  if (invites.length === 0) console.log('（沒有任何邀請碼）');
  for (const invite of invites) console.log(invite.id);
} else if (command === 'add') {
  if (id === undefined) die('用法：npx tsx scripts/invite.ts add <id>');
  if (invites.some((invite) => invite.id === id)) die(`id「${id}」已經有邀請碼，要重發先 remove`);
  const code = generateInviteCode();
  save([...invites, { id, hash: hashInviteCode(code) }]);
  console.log(`邀請碼（只顯示這一次，交給 ${id}）：${code}`);
  console.log('記得 commit、push，部署完才生效。');
} else if (command === 'remove') {
  if (id === undefined || !invites.some((invite) => invite.id === id)) die(`找不到 id「${id}」`);
  save(invites.filter((invite) => invite.id !== id));
  console.log(`已撤銷 ${id}。commit、push，部署完它換到的 token 就失效。`);
} else {
  die('用法：npx tsx scripts/invite.ts add|remove <id> 或 list');
}
