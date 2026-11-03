import { SEARCH_URL, htmlFetch, parseSearch, writeError, type JobCard } from "../helpers.ts"

export interface SearchOpts {
  query: string
  state?: string // full state name, already resolved ("São Paulo")
  jobage?: number // client-side: keep postings published within N days
  remote?: "remote" | "hybrid" | "onsite" // client-side: Gupy ignores this filter server-side
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Gupy encodes filters in the path: /job-search/term=<q>&state=<uf name>&page=<n> */
export function buildUrl(opts: Pick<SearchOpts, "query" | "state" | "page">): string {
  let path = "term=" + encodeURIComponent(opts.query.trim())
  if (opts.state) path += "&state=" + encodeURIComponent(opts.state)
  if (opts.page > 1) path += "&page=" + opts.page
  return SEARCH_URL + path
}

export function applyFilters(cards: JobCard[], opts: Pick<SearchOpts, "jobage" | "remote" | "limit">, today = new Date()): JobCard[] {
  let out = cards
  if (opts.remote) out = out.filter((c) => c.workplace === opts.remote)
  if (opts.jobage !== undefined) {
    const cutoff = new Date(today.getTime() - opts.jobage * 86400000).toISOString().slice(0, 10)
    out = out.filter((c) => c.date !== null && c.date >= cutoff)
  }
  if (opts.limit !== undefined) out = out.slice(0, opts.limit)
  return out
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const pad = (s: string | null, n: number) => (s || "—").slice(0, n).padEnd(n)
  const header = `${pad("ID", 30)} ${pad("TITLE", 40)} ${pad("COMPANY", 22)} ${pad("LOCATION", 22)} ${pad("MODE", 7)} DATE`
  const rows = cards.map(
    (c) => `${pad(c.id, 30)} ${pad(c.title, 40)} ${pad(c.company, 22)} ${pad(c.location, 22)} ${pad(c.workplace, 7)} ${c.date || "—"}`,
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const page = parseSearch(await htmlFetch(buildUrl(opts)))
    const cards = applyFilters(page.results, opts)
    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.workplace || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, pageSize: 12, total: page.total }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
