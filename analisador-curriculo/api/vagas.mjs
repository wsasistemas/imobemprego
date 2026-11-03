// GET /api/vagas (Vercel Function, Node). A lógica e os testes ficam em lib/servidor/vagas.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { buscarVagas } from '../lib/servidor/vagas.mjs';

export function GET(request) {
  return buscarVagas(request, process.env);
}
