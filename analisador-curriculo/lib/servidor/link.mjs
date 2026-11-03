// Ler uma vaga a partir do link (LinkedIn, Indeed, Vagas.com, site da empresa…).
//
// Lê só a página PÚBLICA da vaga, uma vez, quando o usuário pede (como a
// prévia de link de um app de mensagens). Nunca usa login de outro site.
// Muitas páginas de vaga trazem os dados no formato padrão "JobPosting"
// (schema.org), o mesmo que o Google Vagas usa: é isso que lemos. Links da
// Gupy usam o leitor da Gupy. Se a página não tem esse formato ou bloqueia
// a leitura, o app pede para a pessoa colar o texto.
//
// Segurança: só https/http em portas padrão, nada de IP interno (o servidor
// não pode ser usado para acessar a rede da Vercel), no máximo 3
// redirecionamentos e 2 MB por página.

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { json, exigirAcesso } from './comum.mjs';
import { refVaga, buscarDetalheGupy, limparTexto, textoDeHtml } from '../../gupy.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXTO = 15000;
const CABECALHOS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ImobEmpregos/1.0; leitura de vaga a pedido do usuario)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

/** IP de rede interna, loopback, link-local etc. */
export function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return ipPrivado(x.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

export class ErroLink extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

/** Confere o link e se o endereço é público. Devolve o URL. */
export async function conferirUrl(texto, resolver = lookup) {
  let u;
  try { u = new URL(String(texto || '').trim()); } catch { throw new ErroLink(400, 'Link inválido. Copie o link completo da vaga.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErroLink(400, 'Link inválido. Copie o link completo da vaga.');
  if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) throw new ErroLink(400, 'Link não aceito.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || !host.includes('.')) {
    throw new ErroLink(400, 'Link não aceito.');
  }
  let enderecos;
  try { enderecos = await resolver(host, { all: true }); } catch { throw new ErroLink(422, 'Não encontramos esse site. Confira o link.'); }
  if (!enderecos.length || enderecos.some((e) => ipPrivado(e.address))) throw new ErroLink(400, 'Link não aceito.');
  return u;
}

async function lerCorpo(resp) {
  const leitor = resp.body && resp.body.getReader ? resp.body.getReader() : null;
  if (!leitor) return (await resp.text()).slice(0, MAX_BYTES);
  const partes = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await leitor.cancel(); break; }
    partes.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(partes.map((p) => Buffer.from(p))));
}

/** Baixa a página seguindo até 3 redirecionamentos, conferindo cada destino. */
export async function baixarPagina(link, fetchImpl = fetch, resolver = lookup) {
  let u = await conferirUrl(link, resolver);
  for (let i = 0; i < 4; i++) {
    let resp;
    try {
      resp = await fetchImpl(u.href, { headers: CABECALHOS, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    } catch { throw new ErroLink(422, 'O site da vaga não respondeu.'); }
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      if (i === 3) break;
      u = await conferirUrl(new URL(resp.headers.get('location'), u).href, resolver);
      continue;
    }
    if (!resp.ok) throw new ErroLink(422, 'Esse site não deixou ler a vaga pelo link.');
    return { url: u.href, html: await lerCorpo(resp) };
  }
  throw new ErroLink(422, 'Esse site não deixou ler a vaga pelo link.');
}

function blocosJsonLd(html) {
  const blocos = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { blocos.push(JSON.parse(m[1].trim())); } catch { /* bloco quebrado: ignora */ }
  }
  const lista = [];
  const juntar = (x) => {
    if (Array.isArray(x)) return x.forEach(juntar);
    if (x && typeof x === 'object') { lista.push(x); if (x['@graph']) juntar(x['@graph']); }
  };
  juntar(blocos);
  return lista;
}

const ehVaga = (o) => [].concat(o['@type'] || []).some((t) => String(t).toLowerCase() === 'jobposting');
const texto1 = (v) => limparTexto(typeof v === 'string' ? v : (v && (v.name || v['@value'])) || '');

/** Lê o JobPosting da página. null se a página não tem. */
export function extrairVagaDeHtml(html) {
  const vaga = blocosJsonLd(String(html || '')).find(ehVaga);
  if (!vaga) return null;
  const titulo = texto1(vaga.title).slice(0, 200);
  const descricao = textoDeHtml(vaga.description || '');
  if (!titulo || descricao.length < 50) return null;
  const empresa = texto1(vaga.hiringOrganization).slice(0, 200) || null;
  const locais = [].concat(vaga.jobLocation || []).map((l) => {
    const a = (l && l.address) || {};
    return [texto1(a.addressLocality), texto1(a.addressRegion)].filter(Boolean).join(' - ');
  }).filter(Boolean);
  const remoto = [].concat(vaga.jobLocationType || []).some((t) => /telecommute/i.test(String(t)));
  return {
    titulo, empresa,
    local: locais[0] || null,
    modalidade: remoto ? 'Remoto' : null,
    texto: descricao.slice(0, MAX_TEXTO),
  };
}

/** GET /api/ler-link?url=... -> { titulo, empresa, local, modalidade, texto, url, site } */
export async function lerLink(request, env, fetchImpl = fetch, resolver = lookup) {
  const negado = await exigirAcesso(request, env, fetchImpl);
  if (negado) return negado;
  const link = new URL(request.url).searchParams.get('url') || '';
  try {
    // Gupy: leitor próprio (a página da Gupy não usa JobPosting).
    if (refVaga(link)) {
      const d = await buscarDetalheGupy({ url: link, fetchImpl });
      if (!d) throw new ErroLink(422, 'Vaga não encontrada (encerrada ou removida).');
      return json(200, { titulo: d.titulo, empresa: null, local: null, modalidade: null, texto: d.texto.slice(0, MAX_TEXTO), url: link, site: new URL(link).hostname });
    }
    const pagina = await baixarPagina(link, fetchImpl, resolver);
    const v = extrairVagaDeHtml(pagina.html);
    if (!v) throw new ErroLink(422, 'Esse site não deixou ler a vaga pelo link.');
    return json(200, { ...v, url: pagina.url, site: new URL(pagina.url).hostname.replace(/^www\./, '') }, 3600);
  } catch (e) {
    if (e instanceof ErroLink) return json(e.status, { erro: e.message, colar: e.status === 422 });
    console.error('ler-link: erro inesperado', e && e.message);
    return json(422, { erro: 'Esse site não deixou ler a vaga pelo link.', colar: true });
  }
}
