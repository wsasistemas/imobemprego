// Data source: Gupy's public job portal (portal.gupy.io) and each company's
// public career page (<company>.gupy.io). Both are Next.js pages that ship the
// data as JSON inside <script id="__NEXT_DATA__">, so a plain GET is enough:
// no login, no private API. robots.txt allows both paths (checked 2026-11-03).
//
// Runs on bun (the repo default) and on Node 23.6+ (native TypeScript).

export const SEARCH_URL = "https://portal.gupy.io/job-search/"

const UA = "Mozilla/5.0 (compatible; gupy-search-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ------------------------------------------------------------------ text

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", bull: "•", hellip: "…",
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/** HTML fragment -> readable text, keeping paragraph and list breaks. */
export function cleanHtml(html: string | null | undefined): string {
  return String(html ?? "")
    // Raw newlines in HTML are just spaces (postings pasted from Word are full of them).
    .replace(/\s+/g, " ")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d|\/ul|\/ol)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => numericEntity(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => numericEntity(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/^- *$/gm, "")
    // Word-style bullets: a paragraph holding only "·" followed by the item text.
    .replace(/^ *[·•▪●§] *\n+/gm, "- ")
    .replace(/^ *[·•▪●§] +/gm, "- ")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

// ---------------------------------------------------------------- states

export const STATES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** "SP", "sao paulo", "São Paulo" -> "São Paulo". null when unknown. */
export function resolveState(input: string): string | null {
  const t = input.trim()
  if (STATES[t.toUpperCase()]) return STATES[t.toUpperCase()]
  return Object.values(STATES).find((s) => fold(s) === fold(t)) ?? null
}

function stateCode(name: string | null | undefined): string | null {
  if (!name) return null
  return Object.entries(STATES).find(([, v]) => v === name)?.[0] ?? null
}

// ----------------------------------------------------------------- labels

export const WORKPLACE: Record<string, string> = { remote: "remote", hybrid: "hybrid", "on-site": "onsite" }

const JOB_TYPE: Record<string, string> = {
  vacancy_type_effective: "Efetivo (CLT)", vacancy_type_internship: "Estágio", vacancy_type_apprentice: "Jovem aprendiz",
  vacancy_type_talent_pool: "Banco de talentos", vacancy_type_temporary: "Temporário", vacancy_type_trainee: "Trainee",
  vacancy_type_associate: "Associado", vacancy_type_autonomous: "Autônomo", vacancy_legal_entity: "PJ",
  vacancy_type_lecturer: "Docente", vacancy_type_freelancer: "Freelancer", vacancy_type_summer: "Temporada",
}

// ---------------------------------------------------------------- parsing

export function nextData(html: string): any | null {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null
  const m = v.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

function place(city: string | null | undefined, state: string | null | undefined): string | null {
  const uf = stateCode(state) ?? state ?? null
  if (city && uf) return `${city} - ${uf}`
  return city || uf || null
}

/** Company subdomain from a *.gupy.io URL, or null when it is not one. */
export function subdomainOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" || !u.hostname.endsWith(".gupy.io")) return null
    const sub = u.hostname.slice(0, -".gupy.io".length)
    return /^[a-z0-9-]+$/i.test(sub) && sub !== "portal" ? sub : null
  } catch {
    return null
  }
}

export function canonicalUrl(sub: string, jobId: string | number): string {
  return `https://${sub}.gupy.io/jobs/${jobId}`
}

export interface JobCard {
  id: string // "<company subdomain>/<numeric job id>" — accepted as-is by `detail`
  title: string
  company: string | null
  location: string | null
  date: string | null // publication date, YYYY-MM-DD
  deadline: string | null // application deadline, YYYY-MM-DD
  workplace: string | null // remote | hybrid | onsite
  type: string | null
  pcd: boolean
  url: string
}

export interface SearchPage {
  total: number | null
  results: JobCard[]
}

/**
 * Parse the portal search page. Each job is parsed independently so one
 * malformed entry cannot break the rest.
 */
export function parseSearch(html: string): SearchPage {
  const data = nextData(html)
  const list = data?.props?.pageProps?.initialJobList
  if (!list || !Array.isArray(list.data)) {
    throw new Error("Gupy page format changed: initialJobList not found in __NEXT_DATA__")
  }
  const results: JobCard[] = []
  for (const j of list.data) {
    try {
      const sub = typeof j?.jobUrl === "string" ? subdomainOf(j.jobUrl) : null
      const title = cleanHtml(j?.name)
      if (!sub || !j?.id || !title) continue
      results.push({
        id: `${sub}/${j.id}`,
        title,
        company: cleanHtml(j.careerPageName) || null,
        location: place(j.city, j.state) ?? (j.workplaceType === "remote" ? "Remoto" : null),
        date: isoDate(j.publishedDate),
        deadline: isoDate(j.applicationDeadline),
        workplace: WORKPLACE[j.workplaceType] ?? null,
        type: JOB_TYPE[j.type] ?? null,
        pcd: !!j.disabilities,
        url: canonicalUrl(sub, j.id),
      })
    } catch {
      /* skip malformed entry */
    }
  }
  return { total: typeof list.pagination?.total === "number" ? list.pagination.total : null, results }
}

export interface JobDetail extends JobCard {
  description: string | null
  responsibilities: string | null
  requirements: string | null
  additional: string | null
  steps: string[]
  isActive: boolean
}

/**
 * Resolve what the user passed to `detail` into { sub, jobId }:
 *   "empresa/123"                         (the id from search)
 *   "https://empresa.gupy.io/jobs/123"
 *   "https://empresa.gupy.io/job/<base64>?jobBoardSource=gupy_portal"
 */
export function resolveJobRef(input: string): { sub: string; jobId: string } | null {
  const s = input.trim()
  const short = s.match(/^([a-z0-9-]+)\/(\d+)$/i)
  if (short) return { sub: short[1].toLowerCase(), jobId: short[2] }
  const sub = subdomainOf(s)
  if (!sub) return null
  const path = new URL(s).pathname
  const plain = path.match(/^\/jobs\/(\d+)/)
  if (plain) return { sub, jobId: plain[1] }
  const encoded = path.match(/^\/job\/([A-Za-z0-9+/=_-]+)/)
  if (encoded) {
    try {
      const json = JSON.parse(Buffer.from(decodeURIComponent(encoded[1]), "base64").toString("utf8"))
      if (json?.jobId) return { sub, jobId: String(json.jobId) }
    } catch {
      /* not a portal-encoded link */
    }
  }
  return null
}

/** Parse a company career-page job (<sub>.gupy.io/jobs/<id>). null = not found. */
export function parseDetail(html: string, sub: string, jobId: string): JobDetail | null {
  const job = nextData(html)?.props?.pageProps?.job
  if (!job || String(job.id) !== String(jobId)) return null
  // The page has no plain company-name field. "Sobre a <Empresa>" is the best
  // source; the career-page name is next unless it is a generic label.
  const aboutTitle = cleanHtml(job.careerPage?.companyDescriptionTitle)
  const pageName = cleanHtml(job.careerPage?.name)
  const about = /^sobre\s/i.test(aboutTitle)
    ? aboutTitle.replace(/^sobre\s+((a|o|as|os|n[oa]s?)\s+)?/i, "")
    : pageName && !/carreiras?|trabalhe conosco|vagas/i.test(pageName)
      ? pageName
      : ""
  const steps = Array.isArray(job.jobSteps)
    ? job.jobSteps
        .slice()
        .sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
        .map((st: any) => cleanHtml(st?.name))
        .filter(Boolean)
    : []
  return {
    id: `${sub}/${jobId}`,
    title: cleanHtml(job.name),
    company: cleanHtml(about) || job.careerPage?.subdomain || sub,
    location: place(job.addressCity, job.addressState) ?? (job.workplaceType === "remote" ? "Remoto" : null),
    date: isoDate(job.publishedAt),
    deadline: isoDate(job.registerEndDate),
    workplace: WORKPLACE[job.workplaceType] ?? null,
    type: JOB_TYPE[job.jobType] ?? null,
    pcd: !!job.handicapped,
    url: canonicalUrl(sub, jobId),
    description: cleanHtml(job.description) || null,
    responsibilities: cleanHtml(job.responsibilities) || null,
    requirements: cleanHtml(job.prerequisites) || null,
    additional: cleanHtml(job.relevantExperiences) || null,
    steps,
    isActive: job.status === "published",
  }
}

/** Plain-text posting using Gupy's own section titles (what /apply and the analyzer expect). */
export function detailToPlain(d: JobDetail): string {
  const L: string[] = []
  L.push(d.title)
  L.push(`${d.company ?? "—"} · ${d.location ?? "—"} · ${d.workplace ?? "—"} · ${d.type ?? "—"}`)
  L.push(`Publicada: ${d.date ?? "—"} · Inscrições até: ${d.deadline ?? "—"}${d.pcd ? " · Vaga também para PcD" : ""}`)
  if (!d.isActive) L.push("ATENÇÃO: a vaga não está mais publicada.")
  L.push(d.url)
  const sec = (t: string, v: string | null) => {
    if (v) L.push("", t, v)
  }
  sec("Descrição da vaga", d.description)
  sec("Responsabilidades e atribuições", d.responsibilities)
  sec("Requisitos e qualificações", d.requirements)
  sec("Informações adicionais", d.additional)
  if (d.steps.length) L.push("", "Etapas do processo", d.steps.join(" → "))
  return L.join("\n")
}
