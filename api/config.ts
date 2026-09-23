import { handleConfig } from '../lib/handlers.js';
import { productionDeps } from '../lib/deps.js';

// GET /api/config  Authorization: Bearer <token> → { geminiApiKey }
export function GET(request: Request): Response {
  return handleConfig(request, productionDeps());
}
