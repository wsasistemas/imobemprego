#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Gupy (Brazil's largest ATS/job portal)
// through its public pages. Zero runtime dependencies: runs with `bun`, or with
// Node 23.6+ (`node src/cli.ts ...`), which strips TypeScript types natively.

import { runSearch, type SearchOpts } from "./commands/search.ts"
import { runDetail } from "./commands/detail.ts"
import { resolveState, writeError } from "./helpers.ts"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) flags[key] = true
      else {
        flags[key] = next
        i++
      }
    } else (flags._ as string[]).push(a)
  }
  return flags
}

const HELP = `gupy-search — search jobs on Gupy (Brazil) via its public portal

USAGE
  bun run src/cli.ts search --query "<termo>" [flags]
  bun run src/cli.ts detail <empresa/id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (cargo, habilidade). REQUIRED.
  --location, -l <uf>     Brazilian state: "SP", "São Paulo", "MG"... Optional.
  --jobage <days>         Only postings published within N days (client-side).
  --remote <mode>         remote | hybrid | onsite (client-side; Gupy ignores it server-side).
  --page <n>              1-indexed page (12 results/page; Gupy caps a search at 100).
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "analista fiscal" -l SP --jobage 14 --format table
  bun run src/cli.ts search -q "desenvolvedor python" --remote remote --format table
  bun run src/cli.ts detail gmofacilities/12803990 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "remote", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function intFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1) {
    writeError(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
    return null
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const known = KNOWN_FLAGS[cmd]
  if (!known) {
    writeError(`unknown command '${cmd}' - use search or detail`, "UNKNOWN_COMMAND")
    return 1
  }
  // A silently discarded filter changes what the search returns, so unknown flags are errors.
  for (const key of Object.keys(flags)) {
    if (key !== "_" && !known.has(key)) {
      writeError(`unknown flag --${key} for '${cmd}' - flags are never silently ignored; see --help`, "UNKNOWN_FLAG")
      return 1
    }
  }

  const fmt = flags.format !== undefined ? String(flags.format) : "json"

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      writeError('the --query/-q flag is required (e.g. -q "analista fiscal")', "NO_QUERY")
      return 1
    }
    if (!["json", "table", "plain"].includes(fmt)) {
      writeError(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
      return 1
    }
    const opts: SearchOpts = { query: flags.query, page: 1, format: fmt as SearchOpts["format"] }
    if (flags.location !== undefined) {
      const st = typeof flags.location === "string" ? resolveState(flags.location) : null
      if (!st) {
        writeError(`--location must be a Brazilian state (e.g. SP, "Minas Gerais"), got "${flags.location}"`, "BAD_ARG")
        return 1
      }
      opts.state = st
    }
    if (flags.remote !== undefined) {
      const r = String(flags.remote)
      if (!["remote", "hybrid", "onsite"].includes(r)) {
        writeError(`--remote must be remote|hybrid|onsite, got "${r}"`, "BAD_ARG")
        return 1
      }
      opts.remote = r as SearchOpts["remote"]
    }
    for (const name of ["jobage", "page", "limit"] as const) {
      if (flags[name] === undefined) continue
      const v = intFlag(name, flags[name])
      if (v === null) return 1
      opts[name] = v
    }
    return runSearch(opts)
  }

  const ref = (flags._ as string[])[1]
  if (!ref) {
    writeError('detail needs a job reference: "empresa/12345" (id from search) or the job URL', "NO_ID")
    return 1
  }
  if (!["json", "plain"].includes(fmt)) {
    writeError(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    return 1
  }
  return runDetail({ ref, format: fmt as "json" | "plain" })
}

main().then(
  (code) => process.exit(code),
  (e) => {
    writeError(e instanceof Error ? e.message : String(e), "UNEXPECTED")
    process.exit(1)
  },
)
