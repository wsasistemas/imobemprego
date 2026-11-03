# gupy-cli

CLI for searching jobs on **Gupy** (Brazil), the ATS behind most large Brazilian
employers' career pages.

**Data source**: `portal.gupy.io/job-search/...` (search) and `<empresa>.gupy.io/jobs/<id>` (detail). Both embed their data as `__NEXT_DATA__` JSON.
**Authentication**: None required. robots.txt allows both paths.
**Dependencies**: None. Runs with `bun`, or with Node 23.6+ (native TypeScript). `bun install` only pulls dev type defs.

## Installation

```bash
cd .agents/skills/gupy-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` required) |
| `detail` | Full posting by `empresa/id` or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "analista fiscal" -l SP --jobage 14 --format table
bun run src/cli.ts search -q "desenvolvedor python" --remote remote --format table
bun run src/cli.ts detail veigaepostal/12811483 --format plain

# Without bun (Node 23.6+):
node src/cli.ts search -q "analista fiscal" -l SP --format table
```

## Tests

```bash
bun run test          # offline parsing + flag tests; live smoke test with LIVE=1
LIVE=1 bun run test
```

See `../url-reference.md` for the page structure and parsing anchors.
