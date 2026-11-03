// Servidor local do Analisador de Currículo. Sem dependências: só Node 18+.
//
//   node servidor.mjs        -> http://localhost:8765
//
// Escuta apenas em 127.0.0.1 (nada fica exposto na rede), serve só os
// arquivos do app e faz a ponte com a busca pública da Gupy.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarGupy, buscarDetalheGupy, refVaga, ESTADOS } from './gupy.mjs';
import { lerLink } from './lib/servidor/link.mjs';

const PASTA = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT) || 8765;
const ARQUIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/analisador.js': ['analisador.js', 'text/javascript; charset=utf-8'],
  '/entrar.html': ['entrar.html', 'text/html; charset=utf-8'],
  '/termos.html': ['termos.html', 'text/html; charset=utf-8'],
  '/assinatura.html': ['assinatura.html', 'text/html; charset=utf-8'],
  '/privacidade.html': ['privacidade.html', 'text/html; charset=utf-8'],
  '/config.js': ['config.js', 'text/javascript; charset=utf-8'],
  '/auth.js': ['auth.js', 'text/javascript; charset=utf-8'],
  '/validacao.js': ['validacao.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icone.svg': ['icone.svg', 'image/svg+xml'],
  '/icone-180.png': ['icone-180.png', 'image/png'],
  '/icone-192.png': ['icone-192.png', 'image/png'],
  '/icone-512.png': ['icone-512.png', 'image/png'],
  '/img/entrar.jpg': ['img/entrar.jpg', 'image/jpeg'],
  '/img/cadastro.jpg': ['img/cadastro.jpg', 'image/jpeg'],
};

const CACHE_MS = 10 * 60 * 1000;
const CACHE_VAGA_MS = 6 * 60 * 60 * 1000; // o texto de uma vaga quase nunca muda
const INTERVALO_MS = 1500; // no máximo uma consulta à Gupy a cada 1,5 s
const cache = new Map();
let fila = Promise.resolve();

// Todas as consultas passam por uma fila única, espaçadas por INTERVALO_MS,
// mesmo quando o navegador pede várias vagas ao mesmo tempo.
function naFila(fn) {
  const vez = fila.then(fn);
  fila = vez.catch(() => {}).then(() => new Promise((r) => setTimeout(r, INTERVALO_MS)));
  return vez;
}

async function comCache(chave, validade, fn) {
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.t < validade) return { ...guardado.dados, cache: true };
  const dados = await naFila(fn);
  if (cache.size > 500) cache.clear();
  cache.set(chave, { t: Date.now(), dados });
  return dados;
}

const vagas = (termo, estado) =>
  comCache('busca|' + termo.toLowerCase() + '|' + (estado || ''), CACHE_MS, () => buscarGupy({ termo, estado }));
const vaga = (url) =>
  comCache('vaga|' + url, CACHE_VAGA_MS, async () => (await buscarDetalheGupy({ url })) || { naoEncontrada: true });

function json(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });

  if (url.pathname === '/api/vagas') {
    const termo = (url.searchParams.get('termo') || '').trim().slice(0, 80);
    const estado = url.searchParams.get('estado') || '';
    if (!termo) return json(res, 400, { erro: 'Informe um termo de busca.' });
    if (estado && !ESTADOS.includes(estado)) return json(res, 400, { erro: 'Estado inválido.' });
    try {
      return json(res, 200, await vagas(termo, estado));
    } catch (e) {
      return json(res, 502, { erro: 'Não foi possível buscar na Gupy: ' + e.message });
    }
  }
  if (url.pathname === '/api/vaga') {
    const link = url.searchParams.get('url') || '';
    if (!refVaga(link)) return json(res, 400, { erro: 'Link de vaga da Gupy inválido.' });
    try {
      const d = await vaga(link);
      return d.naoEncontrada ? json(res, 404, { erro: 'Vaga não encontrada (encerrada ou removida).' }) : json(res, 200, d);
    } catch (e) {
      return json(res, 502, { erro: 'Não foi possível ler a vaga na Gupy: ' + e.message });
    }
  }
  if (url.pathname === '/api/estados') return json(res, 200, ESTADOS);
  if (url.pathname === '/api/ler-link') {
    // Mesma função da Vercel; sem Supabase configurado, não exige login.
    const r = await lerLink(new Request('http://localhost' + req.url), {});
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(await r.text());
  }

  const arq = ARQUIVOS[url.pathname];
  if (!arq) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
  try {
    const conteudo = await readFile(path.join(PASTA, arq[0]));
    res.writeHead(200, { 'Content-Type': arq[1], 'Cache-Control': 'no-cache' });
    res.end(conteudo);
  } catch {
    res.writeHead(500); res.end('Erro ao ler arquivo');
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log('Analisador de Currículo rodando em http://localhost:' + PORTA);
  console.log('Feche esta janela (ou Ctrl+C) para encerrar.');
});
