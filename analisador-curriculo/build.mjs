// Monta o site para a Cloudflare Pages: copia para dist/ SÓ os arquivos da
// lista abaixo. Tudo o mais (Vigia, testes, scripts do Windows, dados) fica fora.
// As funções em functions/ são publicadas pela própria Cloudflare.
//
//   node build.mjs

import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
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

// Cabeçalhos de segurança para todas as páginas.
const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;

await rm(DESTINO, { recursive: true, force: true });
for (const arq of PUBLICOS) {
  const origem = path.join(PASTA, arq);
  try { await access(origem); } catch { throw new Error('Arquivo público ausente: ' + arq); }
  await mkdir(path.dirname(path.join(DESTINO, arq)), { recursive: true });
  await cp(origem, path.join(DESTINO, arq));
}
await writeFile(path.join(DESTINO, '_headers'), HEADERS);
console.log(`dist/ pronto: ${PUBLICOS.length} arquivos.`);
