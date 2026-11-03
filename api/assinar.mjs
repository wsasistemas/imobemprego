// POST /api/assinar (Vercel Function, Node). A lógica e os testes ficam em analisador-curriculo/lib/servidor/acoes.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { assinar } from '../analisador-curriculo/lib/servidor/acoes.mjs';

export function POST(request) {
  return assinar(request, process.env);
}
