// GET /api/vaga?url=https://<empresa>.gupy.io/jobs/<id>  (mesmo contrato do servidor.mjs local)
import { buscarDetalheGupy, refVaga } from '../gupy.mjs';
import { json, guardarVagaNoSupabase } from './_comum.mjs';

export async function GET(request) {
  const link = new URL(request.url).searchParams.get('url') || '';
  if (!refVaga(link)) return json(400, { erro: 'Link de vaga da Gupy inválido.' });
  try {
    const d = await buscarDetalheGupy({ url: link });
    if (!d) return json(404, { erro: 'Vaga não encontrada (encerrada ou removida).' });
    await guardarVagaNoSupabase({
      url: link, titulo: d.titulo, ativa: d.ativa, prazo: d.prazo, publicada: d.publicada, texto: d.texto,
    });
    return json(200, d, 21600);
  } catch (e) {
    return json(502, { erro: 'Não foi possível ler a vaga na Gupy: ' + e.message });
  }
}
