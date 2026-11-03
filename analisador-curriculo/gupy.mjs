// Busca de vagas na página pública do portal da Gupy (portal.gupy.io).
//
// A página de busca já vem do servidor com as vagas em JSON (__NEXT_DATA__),
// então basta um GET comum — sem login, sem API privada. O robots.txt do
// portal permite o acesso. Uso pessoal e em baixo volume: o servidor local
// guarda cache e espaça as consultas.

export const ESTADOS = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo',
  'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba',
  'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul',
  'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
];

const MODALIDADE = { remote: 'Remoto', hybrid: 'Híbrido', 'on-site': 'Presencial' };
const TIPO = {
  vacancy_type_effective: 'Efetivo', vacancy_type_internship: 'Estágio', vacancy_type_apprentice: 'Jovem aprendiz',
  vacancy_type_talent_pool: 'Banco de talentos', vacancy_type_temporary: 'Temporário', vacancy_type_trainee: 'Trainee',
  vacancy_type_associate: 'Associado', vacancy_type_autonomous: 'Autônomo', vacancy_legal_entity: 'PJ',
  vacancy_type_lecturer: 'Docente', vacancy_type_freelancer: 'Freelancer', vacancy_type_summer: 'Temporada',
};

// Os filtros vão no caminho, separados por "&". Cada página traz 12 vagas,
// das mais novas para as mais antigas; a Gupy limita a busca a 100 vagas.
export function montarUrlGupy(termo, estado, pagina) {
  let url = 'https://portal.gupy.io/job-search/term=' + encodeURIComponent(String(termo).trim());
  if (estado) url += '&state=' + encodeURIComponent(estado);
  if (pagina > 1) url += '&page=' + Math.floor(pagina);
  return url;
}

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', bull: '•', hellip: '…' };
export function limparTexto(s) {
  return String(s || '')
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Subdomínio da empresa num link *.gupy.io (null se não for da Gupy).
function subdominio(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.gupy.io')) return null;
    const sub = url.hostname.slice(0, -'.gupy.io'.length);
    return /^[a-z0-9-]+$/i.test(sub) && sub !== 'portal' ? sub : null;
  } catch { return null; }
}

// Link canônico da vaga: https://<empresa>.gupy.io/jobs/<id>. É a página que
// traz a vaga completa (requisitos, atividades, prazo) e o que o /apply recebe.
function urlVaga(jobUrl, id) {
  const sub = subdominio(jobUrl);
  return sub && /^\d+$/.test(String(id)) ? 'https://' + sub + '.gupy.io/jobs/' + id : null;
}

export function extrairVagasGupy(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('A página da Gupy mudou de formato: dados das vagas não encontrados.');
  const lista = JSON.parse(m[1])?.props?.pageProps?.initialJobList;
  if (!lista || !Array.isArray(lista.data)) throw new Error('A página da Gupy mudou de formato: lista de vagas ausente.');
  return {
    total: lista.pagination?.total ?? lista.data.length,
    vagas: lista.data.map((j) => ({
      id: j.id,
      titulo: limparTexto(j.name),
      empresa: limparTexto(j.careerPageName),
      cidade: j.city || '',
      estado: j.state || '',
      modalidade: MODALIDADE[j.workplaceType] || j.workplaceType || '',
      tipo: TIPO[j.type] || '',
      publicada: j.publishedDate || null,
      prazo: j.applicationDeadline || null,
      pcd: !!j.disabilities,
      url: urlVaga(j.jobUrl, j.id),
      descricao: limparTexto(j.description),
    })),
  };
}

export async function buscarGupy({ termo, estado, pagina = 1, fetchImpl = fetch } = {}) {
  if (!termo || !String(termo).trim()) throw new Error('Informe um termo de busca.');
  if (estado && !ESTADOS.includes(estado)) throw new Error('Estado inválido.');
  const resp = await fetchImpl(montarUrlGupy(termo, estado, pagina), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnalisadorCurriculo/1.0 (uso pessoal)',
      'Accept': 'text/html',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error('A Gupy respondeu HTTP ' + resp.status + '.');
  return extrairVagasGupy(await resp.text());
}

// ------------------------------------------------------------ vaga completa
//
// A busca só traz a apresentação da empresa. Requisitos e atividades estão na
// página da vaga (https://<empresa>.gupy.io/jobs/<id>), também com __NEXT_DATA__.
// O robots.txt das páginas de empresa libera /jobs.

const CABECALHOS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnalisadorCurriculo/1.0 (uso pessoal)',
  'Accept': 'text/html',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

/** {sub, id} a partir de https://<empresa>.gupy.io/jobs/<id>; null se não for isso. */
export function refVaga(u) {
  const sub = subdominio(u);
  if (!sub) return null;
  const m = new URL(u).pathname.match(/^\/jobs\/(\d+)$/);
  return m ? { sub, id: m[1] } : null;
}

// HTML colado do Word traz quebras de linha no meio das frases e marcadores
// "·" como parágrafos soltos. Quebra de linha no HTML é só espaço.
function textoDeHtml(html) {
  return limparTexto(String(html || '').replace(/\s+/g, ' ').replace(/<\s*li[^>]*>/gi, '\n- '))
    .replace(/ *\n */g, '\n')
    .replace(/^ *[·•▪●§] *\n+/gm, '- ')
    .replace(/^ *[·•▪●§] +/gm, '- ')
    .replace(/^- *$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function extrairDetalheGupy(html, ref) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  let job = null;
  try { job = m ? JSON.parse(m[1])?.props?.pageProps?.job : null; } catch { /* JSON inválido */ }
  // Vaga removida ou id errado: a Gupy redireciona para o login, sem "job".
  if (!job || String(job.id) !== String(ref.id)) return null;
  const secoes = [
    ['Descrição da vaga', job.description],
    ['Responsabilidades e atribuições', job.responsibilities],
    ['Requisitos e qualificações', job.prerequisites],
    ['Informações adicionais', job.relevantExperiences],
  ].map(([t, v]) => [t, textoDeHtml(v)]).filter(([, v]) => v);
  return {
    titulo: limparTexto(job.name),
    ativa: job.status === 'published',
    prazo: job.registerEndDate || null,
    publicada: job.publishedAt || null,
    texto: secoes.map(([t, v]) => t + '\n' + v).join('\n\n'),
  };
}

export async function buscarDetalheGupy({ url, fetchImpl = fetch } = {}) {
  const ref = refVaga(url);
  if (!ref) throw new Error('Link de vaga da Gupy inválido.');
  const resp = await fetchImpl('https://' + ref.sub + '.gupy.io/jobs/' + ref.id, {
    headers: CABECALHOS, redirect: 'follow', signal: AbortSignal.timeout(20000),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('A Gupy respondeu HTTP ' + resp.status + '.');
  return extrairDetalheGupy(await resp.text(), ref);
}
