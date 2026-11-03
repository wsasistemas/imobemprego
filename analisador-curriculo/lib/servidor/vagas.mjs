// Busca de vagas (Gupy) para as funções do site. Só para quem está logado e
// no teste grátis ou com a mensalidade em dia.

import { buscarGupy, buscarDetalheGupy, refVaga, ESTADOS } from '../../gupy.mjs';
import { json, exigirAcesso, guardarVagaNoSupabase } from './comum.mjs';

/** GET /api/vagas?termo=...&estado=... */
export async function buscarVagas(request, env, fetchImpl = fetch) {
  const negado = await exigirAcesso(request, env, fetchImpl);
  if (negado) return negado;
  const p = new URL(request.url).searchParams;
  const termo = (p.get('termo') || '').trim().slice(0, 80);
  const estado = p.get('estado') || '';
  if (!termo) return json(400, { erro: 'Informe um termo de busca.' });
  if (estado && !ESTADOS.includes(estado)) return json(400, { erro: 'Estado inválido.' });
  try {
    return json(200, await buscarGupy({ termo, estado, fetchImpl }), 600);
  } catch (e) {
    return json(502, { erro: 'Não foi possível buscar na Gupy: ' + e.message });
  }
}

/** GET /api/vaga?url=https://<empresa>.gupy.io/jobs/<id> */
export async function lerVaga(request, env, fetchImpl = fetch) {
  const negado = await exigirAcesso(request, env, fetchImpl);
  if (negado) return negado;
  const link = new URL(request.url).searchParams.get('url') || '';
  if (!refVaga(link)) return json(400, { erro: 'Link de vaga da Gupy inválido.' });
  try {
    const d = await buscarDetalheGupy({ url: link, fetchImpl });
    if (!d) return json(404, { erro: 'Vaga não encontrada (encerrada ou removida).' });
    await guardarVagaNoSupabase(env, {
      url: link, titulo: d.titulo, ativa: d.ativa, prazo: d.prazo, publicada: d.publicada, texto: d.texto,
    }, fetchImpl);
    return json(200, d, 21600);
  } catch (e) {
    return json(502, { erro: 'Não foi possível ler a vaga na Gupy: ' + e.message });
  }
}
