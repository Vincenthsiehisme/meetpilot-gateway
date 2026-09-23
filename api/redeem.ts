import { handleRedeem } from '../lib/handlers.js';
import { productionDeps } from '../lib/deps.js';

// POST /api/redeem  { "code": "<邀請碼>" } → { token, inviteId }
export function POST(request: Request): Promise<Response> {
  return handleRedeem(request, productionDeps());
}
