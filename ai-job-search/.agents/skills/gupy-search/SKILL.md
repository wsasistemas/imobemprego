---
name: gupy-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Brazil on Gupy,
  the ATS behind most large Brazilian employers' career pages (portal.gupy.io and
  <empresa>.gupy.io), or to read a specific Gupy job posting. Covers any sector
  or role, filterable by Brazilian state (UF) and remote/hybrid/on-site. Trigger
  phrases: find a job in Brazil, Brazilian jobs, Gupy, search Gupy, vagas,
  vagas de emprego, buscar vagas, procurar emprego, vagas na Gupy, vaga remota,
  vagas em São Paulo, oportunidades de emprego, ver esta vaga da Gupy.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/gupy-search/cli/src/cli.ts *)
---

# Gupy Search Skill

Search live job listings on **Gupy** (Brazil) and fetch a posting's full text,
split into Gupy's own sections (Descrição da vaga / Responsabilidades e
atribuições / Requisitos e qualificações / Informações adicionais). No login,
no API key, **zero runtime dependencies**: it runs with `bun` (or with Node 23.6+
as `node .agents/skills/gupy-search/cli/src/cli.ts ...`).

Data comes from the public portal search page and each company's public career
page; `robots.txt` on both allows these paths (checked 2026-11-03). Still
personal use: keep volume low, a handful of searches per run, not a crawl.

## When to use this skill

- Search Brazilian job openings by keyword, optionally by state (UF)
- Keep only remote, hybrid or on-site roles
- Keep only postings published in the last N days
- Get the full description, requirements, deadline and hiring steps of a Gupy posting

## Commands

### Search job listings

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts search --query "<termo>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Cargo, skill or area, in Portuguese (`"analista fiscal"`, `"desenvolvedor python"`).
- `--location <uf>` / `-l <uf>` — Brazilian state, as UF or name: `SP`, `"Minas Gerais"`, `rj`. Server-side filter.
- `--jobage <days>` — only postings published within N days. **Client-side** (Gupy has no date parameter): it filters the 12 results of the requested page, so it can return fewer than 12.
- `--remote <mode>` — `remote`, `hybrid` or `onsite`. **Client-side** (Gupy ignores its own workplace parameter in the URL).
- `--page <n>` — page number (1-indexed, 12 results per page, newest first). Gupy caps a search at 100 results (9 pages).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts detail <empresa/id|url> [--format json|plain]
```

Pass the `id` from `search` results as-is (`veigaepostal/12811483`), or any Gupy job
URL (`https://empresa.gupy.io/jobs/12345`, or the portal's long `.../job/<base64>` link).
A bare number is rejected: each Gupy job lives on its company's subdomain.

`--format plain` prints the posting with Gupy's section titles, ready to paste into
`/apply` or into the Analisador de Currículo. JSON adds `isActive` (`false` = the
posting is no longer published), `deadline`, `steps` (hiring stages) and `pcd`.

## Usage examples

```bash
# Analista fiscal em São Paulo, últimos 14 dias
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "analista fiscal" -l SP --jobage 14 --format table

# Desenvolvedor Python, só remoto
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "desenvolvedor python" --remote remote --format table

# Assistente administrativo em Minas Gerais, segunda página
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "assistente administrativo" -l "Minas Gerais" --page 2 --format table

# Analista de dados no Paraná, híbrido, até 5 resultados
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "analista de dados" -l PR --remote hybrid -n 5

# Texto completo de uma vaga
bun run .agents/skills/gupy-search/cli/src/cli.ts detail veigaepostal/12811483 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Each search result has `id`, `title`, `company`, `location` ("Cidade - UF" or "Remoto"),
`date` (published, YYYY-MM-DD), `deadline`, `workplace`, `type` (CLT, PJ, Estágio…),
`pcd` and `url`. Missing values are `null`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Results are the newest postings first. Many postings are written in Portuguese only; check the Language Gate in `04-job-evaluation.md` against your declared languages.
- `company` in search is the career-page name the company chose ("Vagas - Empresa Confidencial", "Compass UOL"). Confidential postings are common.
- `type: "Banco de talentos"` is a talent pool, not an open position. Treat it as low priority.
- Postings marked `pcd: true` are open to everyone **and** to people with disabilities; the title says when a role is exclusive ("Exclusiva para PcD").
- The parser reads the `__NEXT_DATA__` JSON that Gupy embeds in its pages. If Gupy changes that, `search` fails with "Gupy page format changed"; see `url-reference.md`.
