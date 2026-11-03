// GET /api/vaga (Vercel Function, Node). A lógica e os testes ficam em lib/servidor/vagas.mjs.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { lerVaga } from '../lib/servidor/vagas.mjs';

export function GET(request) {
  return lerVaga(request, process.env);
}
