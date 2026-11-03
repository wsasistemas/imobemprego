// POST /api/cancelar (Vercel Function, Node). A lógica e os testes ficam em lib/servidor/acoes.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { cancelar } from '../lib/servidor/acoes.mjs';

export function POST(request) {
  return cancelar(request, process.env);
}
