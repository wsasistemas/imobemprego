// Vigia de Vagas: busca vagas novas na Gupy, lê cada vaga completa, dá a nota
// de aderência ao seu currículo e gera um relatório HTML. Feito para rodar
// sozinho uma vez por dia (veja agendar-vigia.ps1), mas também roda à mão:
//
//   node vigia.mjs              -> usa vigia.json
//   node vigia.mjs --sem-abrir  -> não abre o relatório no navegador
//
// Nada é enviado à Gupy além dos termos de busca. O currículo é lido aqui e
// não sai da máquina. Uso pessoal e em baixo volume: as consultas são
// espaçadas e há um teto de vagas lidas por execução.

import { readFile, writeFile, mkdir, copyFile, appendFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarGupy, buscarDetalheGupy, ESTADOS } from './gupy.mjs';

const A = createRequire(import.meta.url)('./analisador.js');
const PASTA = path.dirname(fileURLToPath(import.meta.url));
// Onde ficam vigia.json, dados/ e relatorios/ (VIGIA_DIR serve para testes).
const BASE = process.env.VIGIA_DIR ? path.resolve(process.env.VIGIA_DIR) : PASTA;
const exec = promisify(execFile);

const PADRAO = {
  curriculo: '',
  buscas: [],
  paginas: 1,
  diasMaximos: 14,
  notaMinima: 30,
  maxVagasPorExecucao: 40,
  abrirRelatorio: true,
};
const INTERVALO_MS = 1500;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ configuração

export function validarConfig(c) {
  const erros = [];
  if (!c.curriculo) erros.push('"curriculo" está vazio: informe o caminho do seu currículo (PDF ou TXT).');
  if (!Array.isArray(c.buscas) || !c.buscas.length) erros.push('"buscas" está vazio: inclua ao menos um termo.');
  else c.buscas.forEach((b, i) => {
    if (!b || !String(b.termo || '').trim()) erros.push(`buscas[${i}]: falta "termo".`);
    if (b && b.estado && !ESTADOS.includes(b.estado)) erros.push(`buscas[${i}]: estado "${b.estado}" inválido. Use o nome completo, ex.: "São Paulo".`);
  });
  if (!(c.paginas >= 1 && c.paginas <= 9)) erros.push('"paginas" deve ser de 1 a 9 (12 vagas por página).');
  if (!(c.maxVagasPorExecucao >= 1 && c.maxVagasPorExecucao <= 100)) erros.push('"maxVagasPorExecucao" deve ser de 1 a 100.');
  return erros;
}

async function existe(p) { try { await access(p); return true; } catch { return false; } }

async function lerJson(p, padrao) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return padrao; throw new Error(`${path.basename(p)} não é um JSON válido: ${e.message}`); }
}

// ------------------------------------------------------------ currículo

const PDFTOTEXT = ['pdftotext', 'C:\\Program Files\\Git\\ucrt64\\bin\\pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'];

export async function lerCurriculo(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === '.txt' || ext === '.md') return readFile(arquivo, 'utf8');
  if (ext !== '.pdf') throw new Error('Formato de currículo não suportado (' + ext + '). Use PDF ou TXT. Do Word: Arquivo > Salvar como > PDF.');
  for (const exe of PDFTOTEXT) {
    try {
      const { stdout } = await exec(exe, ['-enc', 'UTF-8', arquivo, '-'], { maxBuffer: 20 * 1024 * 1024 });
      return stdout;
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw new Error('Não consegui ler o PDF do currículo: ' + (e.stderr || e.message));
    }
  }
  throw new Error('Para ler currículo em PDF preciso do pdftotext (vem com o Git para Windows). Alternativa: salve o currículo como .txt e aponte "curriculo" para ele.');
}

// ------------------------------------------------------------ seleção

/** Vagas da busca que ainda não foram vistas, dentro do prazo e dos filtros. */
export function selecionarNovas(resultados, vistas, { diasMaximos, hoje = new Date() }) {
  const limite = diasMaximos ? new Date(hoje.getTime() - diasMaximos * 86400000) : null;
  const unicas = new Map();
  for (const { busca, vagas } of resultados) {
    for (const v of vagas) {
      if (!v.url || vistas[v.url] || unicas.has(v.url)) continue;
      if (busca.remoto && v.modalidade !== 'Remoto') continue;
      if (limite && v.publicada && new Date(v.publicada) < limite) continue;
      unicas.set(v.url, { ...v, busca: busca.termo + (busca.estado ? ' · ' + busca.estado : '') + (busca.remoto ? ' · remoto' : '') });
    }
  }
  return [...unicas.values()];
}

// ------------------------------------------------------------ relatório

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dataBR = (s) => { if (!s) return ''; const d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); };
const classe = (n) => (n == null ? 'na' : n >= 60 ? 'ok' : n >= 35 ? 'med' : 'bad');

function cartao(v) {
  const local = [v.cidade, v.estado].filter(Boolean).join(' / ');
  const info = [v.empresa, local, v.modalidade, v.tipo].filter(Boolean).map(esc).join(' · ');
  const datas = [v.publicada ? 'publicada em ' + dataBR(v.publicada) : '', v.prazo ? 'inscrições até ' + dataBR(v.prazo) : ''].filter(Boolean).join(' · ');
  const avisos = [];
  if (v.ativa === false) avisos.push('Esta vaga não está mais publicada.');
  if (v.alertaIntegridade) avisos.push('A vaga tem trechos com cara de instrução para IA ou caracteres disfarçados. Leia o original antes de usar automação nela.');
  if (v.erro) avisos.push('Não consegui ler a vaga completa (' + v.erro + '). A nota usa só a apresentação da empresa.');
  if (v.tipo === 'Banco de talentos') avisos.push('Banco de talentos: não é uma vaga aberta agora.');
  const faltam = v.faltam && v.faltam.length ? `<p class="falt">Requisitos que não aparecem no currículo: ${esc(v.faltam.slice(0, 6).join(', '))}</p>` : '';
  return `<article class="vaga">
  <div class="nota ${classe(v.nota)}" title="Aderência ao seu currículo">${v.nota == null ? '—' : v.nota + '%'}</div>
  <div class="corpo">
    <h3><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.titulo)}</a></h3>
    <p class="info">${info}</p>
    <p class="info">${esc(datas)}${datas ? ' · ' : ''}busca: ${esc(v.busca)}</p>
    ${faltam}${avisos.map((a) => `<p class="aviso">${esc(a)}</p>`).join('')}
    <div class="acoes">
      <a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Abrir na Gupy ↗</a>
      <button class="btn" data-copiar="/apply ${esc(v.url)}">Copiar /apply</button>
    </div>
  </div>
</article>`;
}

export function montarRelatorio(vagas, { notaMinima, quando = new Date(), erros = [], totalVistas = 0 }) {
  const ordenadas = [...vagas].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
  const boas = ordenadas.filter((v) => v.nota != null && v.nota >= notaMinima && v.ativa !== false);
  const outras = ordenadas.filter((v) => !boas.includes(v));
  const quandoTxt = quando.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vagas novas · ${esc(quando.toLocaleDateString('pt-BR'))}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--tx:#1b1f24;--mut:#5b6470;--bd:#dde1e6;--ok:#1a7f37;--med:#9a6700;--bad:#c4321c;--na:#6e7781;--lk:#0b5cad}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--tx:#e6e9ed;--mut:#9aa4af;--bd:#2a3038;--ok:#3fb950;--med:#d29922;--bad:#f0705a;--na:#8b949e;--lk:#6cb6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.1rem;margin:32px 0 12px}
.mut{color:var(--mut)}.vaga{display:flex;gap:14px;background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px;margin:10px 0}
.nota{flex:none;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-weight:700;border:3px solid currentColor}
.nota.ok{color:var(--ok)}.nota.med{color:var(--med)}.nota.bad{color:var(--bad)}.nota.na{color:var(--na)}
.corpo{min-width:0;flex:1}h3{font-size:1.02rem;margin:0 0 2px}h3 a{color:var(--lk);text-decoration:none}h3 a:hover{text-decoration:underline}
.info{margin:2px 0;color:var(--mut);font-size:.9rem;overflow-wrap:anywhere}.falt{margin:6px 0 0;font-size:.9rem}.aviso{margin:6px 0 0;font-size:.9rem;color:var(--bad)}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.btn{font:inherit;font-size:.88rem;padding:6px 12px;border-radius:6px;border:1px solid var(--bd);background:transparent;color:var(--tx);cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--lk)}.erros{border-left:3px solid var(--bad);padding:4px 12px}footer{margin-top:32px;font-size:.85rem;color:var(--mut)}
</style></head><body><main>
<h1>Vagas novas na Gupy</h1>
<p class="mut">${esc(quandoTxt)} · ${vagas.length} vaga(s) nova(s) · ${boas.length} com nota ${notaMinima}% ou mais</p>
${erros.length ? `<div class="erros"><p><b>Algumas buscas falharam:</b></p><ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
${!vagas.length ? '<p>Nenhuma vaga nova desde a última execução.</p>' : ''}
${boas.length ? `<h2>Melhores para você</h2>${boas.map(cartao).join('\n')}` : ''}
${outras.length ? `<h2>Outras vagas novas</h2>${outras.map(cartao).join('\n')}` : ''}
<footer>
<p>A nota compara os termos da vaga com o seu currículo: requisito pesa mais que atividade, e atividade mais que diferencial. É uma triagem, não a decisão de um recrutador.</p>
<p>Requisito que falta é lacuna. Coloque no currículo só o que você realmente tem.</p>
<p>Próximo passo: copie o <b>/apply</b> da vaga e cole no Claude Code, dentro da pasta ai-job-search. ${totalVistas} vaga(s) já vistas no histórico.</p>
</footer>
</main>
<script>
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copiar]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiado!'; }
  catch { prompt('Copie o comando:', b.dataset.copiar); }
});
</script>
</body></html>
`;
}

// ------------------------------------------------------------ execução

async function executar({ abrir }) {
  const arqConfig = path.join(BASE, 'vigia.json');
  if (!(await existe(arqConfig))) {
    await copyFile(path.join(PASTA, 'vigia.exemplo.json'), arqConfig);
    console.log('Criei o arquivo vigia.json a partir do exemplo.');
    console.log('Abra ' + arqConfig + ', informe o caminho do currículo e os termos de busca, e rode de novo.');
    return 2;
  }
  const config = { ...PADRAO, ...(await lerJson(arqConfig, {})) };
  const erros = validarConfig(config);
  if (erros.length) { console.error('Arrume o vigia.json:\n- ' + erros.join('\n- ')); return 2; }

  const cvArquivo = path.resolve(BASE, config.curriculo);
  const cvTexto = await lerCurriculo(cvArquivo);
  if (cvTexto.trim().split(/\s+/).length < 60) console.warn('Aviso: quase nenhum texto lido do currículo. Se o PDF é uma imagem (escaneado), um ATS também não lê. As notas vão sair baixas.');

  const pastaDados = path.join(BASE, 'dados');
  const pastaRel = path.join(BASE, 'relatorios');
  await mkdir(pastaDados, { recursive: true });
  await mkdir(pastaRel, { recursive: true });
  const arqVistas = path.join(pastaDados, 'vistas.json');
  const vistas = await lerJson(arqVistas, {});

  // 1. Buscar
  const resultados = [], falhas = [];
  for (const busca of config.buscas) {
    for (let pagina = 1; pagina <= config.paginas; pagina++) {
      try {
        const r = await buscarGupy({ termo: busca.termo, estado: busca.estado || '', pagina });
        resultados.push({ busca, vagas: r.vagas });
        console.log(`Busca "${busca.termo}"${busca.estado ? ' em ' + busca.estado : ''}, página ${pagina}: ${r.vagas.length} vagas`);
        await espera(INTERVALO_MS);
        if (r.vagas.length < 12) break;
      } catch (e) {
        falhas.push(`"${busca.termo}" (página ${pagina}): ${e.message}`);
        console.error('Falhou: ' + falhas.at(-1));
        break;
      }
    }
  }

  // 2. Ler as vagas novas
  const novas = selecionarNovas(resultados, vistas, { diasMaximos: config.diasMaximos });
  const lidas = novas.slice(0, config.maxVagasPorExecucao);
  if (novas.length > lidas.length) falhas.push(`${novas.length - lidas.length} vaga(s) nova(s) ficaram para a próxima execução (limite de ${config.maxVagasPorExecucao} por vez).`);
  console.log(`${novas.length} vaga(s) nova(s). Lendo ${lidas.length}…`);

  const hoje = new Date().toISOString().slice(0, 10);
  for (const v of lidas) {
    let texto = v.descricao;
    try {
      const d = await buscarDetalheGupy({ url: v.url });
      if (d) { texto = d.texto || texto; v.ativa = d.ativa; v.prazo = d.prazo || v.prazo; }
      else v.ativa = false;
    } catch (e) { v.erro = e.message; }
    const a = A.aderencia(cvTexto, v.titulo + '\n' + texto);
    v.nota = a.nota; v.faltam = a.faltam;
    v.alertaIntegridade = A.verificarIntegridade(texto).alerta;
    vistas[v.url] = { titulo: v.titulo, empresa: v.empresa, primeiraVez: hoje, nota: v.nota, publicada: v.publicada || null };
    await espera(INTERVALO_MS);
  }
  await writeFile(arqVistas, JSON.stringify(vistas, null, 1));

  // 3. Relatório
  const html = montarRelatorio(lidas, { notaMinima: config.notaMinima, erros: falhas, totalVistas: Object.keys(vistas).length });
  const arqRel = path.join(pastaRel, `vagas-${hoje}.html`);
  await writeFile(arqRel, html);
  await writeFile(path.join(pastaRel, 'ultimo.html'), html);
  const boas = lidas.filter((v) => v.nota != null && v.nota >= config.notaMinima).length;
  const linha = `${new Date().toISOString()} buscas=${config.buscas.length} novas=${novas.length} lidas=${lidas.length} boas=${boas} falhas=${falhas.length}`;
  await appendFile(path.join(pastaDados, 'vigia.log'), linha + '\n');
  console.log(`Relatório: ${arqRel}`);
  console.log(`${boas} vaga(s) com nota ${config.notaMinima}% ou mais.`);

  if (abrir && config.abrirRelatorio && lidas.length) {
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', arqRel], { windowsHide: true });
    else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [arqRel]);
  }
  return falhas.length && !resultados.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executar({ abrir: !process.argv.includes('--sem-abrir') }).then(
    (codigo) => { process.exitCode = codigo; },
    (e) => { console.error('Erro: ' + e.message); process.exitCode = 1; },
  );
}
