// GET /api/vagas?termo=...&estado=...  (mesmo contrato do servidor.mjs local)
import { buscarGupy, ESTADOS } from '../gupy.mjs';
import { json } from './_comum.mjs';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const termo = (p.get('termo') || '').trim().slice(0, 80);
  const estado = p.get('estado') || '';
  if (!termo) return json(400, { erro: 'Informe um termo de busca.' });
  if (estado && !ESTADOS.includes(estado)) return json(400, { erro: 'Estado inválido.' });
  try {
    return json(200, await buscarGupy({ termo, estado }), 600);
  } catch (e) {
    return json(502, { erro: 'Não foi possível buscar na Gupy: ' + e.message });
  }
}
