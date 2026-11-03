// GET /api/vagas (Vercel Function, Node). A lógica e os testes ficam em analisador-curriculo/lib/servidor/vagas.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { buscarVagas } from '../analisador-curriculo/lib/servidor/vagas.mjs';

export function GET(request) {
  return buscarVagas(request, process.env);
}
