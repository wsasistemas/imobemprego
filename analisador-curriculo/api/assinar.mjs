// POST /api/assinar (Vercel Function, Node). A lógica e os testes ficam em lib/servidor/acoes.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { assinar } from '../lib/servidor/acoes.mjs';

export function POST(request) {
  return assinar(request, process.env);
}
