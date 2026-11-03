// Monta o site para a Vercel: copia para dist/ SÓ os arquivos da lista abaixo.
// Tudo o mais (Vigia, testes, scripts do Windows, dados) fica fora do site.
// As funções em api/ são publicadas pela própria Vercel. Os cabeçalhos de
// segurança estão no vercel.json.
//
//   node build.mjs

import { cp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(PASTA, 'dist');

const PUBLICOS = [
  'index.html', 'entrar.html', 'assinatura.html', 'termos.html', 'privacidade.html',
  'analisador.js', 'auth.js', 'config.js', 'validacao.js',
  'manifest.webmanifest', 'icone.svg', 'icone-180.png', 'icone-192.png', 'icone-512.png',
  'img/entrar.jpg', 'img/cadastro.jpg',
];


await rm(DESTINO, { recursive: true, force: true });
for (const arq of PUBLICOS) {
  const origem = path.join(PASTA, arq);
  try { await access(origem); } catch { throw new Error('Arquivo público ausente: ' + arq); }
  await mkdir(path.dirname(path.join(DESTINO, arq)), { recursive: true });
  await cp(origem, path.join(DESTINO, arq));
}
console.log(`dist/ pronto: ${PUBLICOS.length} arquivos.`);
