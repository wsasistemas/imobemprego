// GET /api/vagas?termo=...&estado=...  (Cloudflare Pages Function)
// Só para quem está logado e no teste grátis ou com a mensalidade em dia.
import { buscarGupy, ESTADOS } from '../../gupy.mjs';
import { json, exigirAcesso } from '../../lib/servidor/comum.mjs';

export async function onRequestGet({ request, env }) {
  const negado = await exigirAcesso(request, env);
  if (negado) return negado;
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
