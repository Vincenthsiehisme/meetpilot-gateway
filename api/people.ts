import { handlePeople } from '../lib/handlers.js';
import { productionDeps } from '../lib/deps.js';

// GET /api/people  Authorization: Bearer <token> → { version, rows }（rows 形狀由 MeetPilot 定義）
export function GET(request: Request): Promise<Response> {
  return handlePeople(request, productionDeps());
}
