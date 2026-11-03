// CLI contract: flag validation runs offline. The live smoke test hits Gupy
// (two requests) and runs only with LIVE=1: CI never calls real portals
// (see .github/workflows/ci.yml).
import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

const err = (s: string): { error?: string; code?: string } => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

describe("flag validation", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["missing query", ["search"], "NO_QUERY"],
    ["bad state", ["search", "-q", "x", "-l", "Lisboa"], "BAD_ARG"],
    ["bad remote mode", ["search", "-q", "x", "--remote", "anywhere"], "BAD_ARG"],
    ["fractional page", ["search", "-q", "x", "--page", "1.5"], "BAD_ARG"],
    ["zero jobage", ["search", "-q", "x", "--jobage", "0"], "BAD_ARG"],
    ["bad format", ["search", "-q", "x", "--format", "xml"], "BAD_ARG"],
    ["detail without ref", ["detail"], "NO_ID"],
    ["detail with bare id", ["detail", "12345"], "BAD_REF"],
    ["unknown command", ["apply"], "UNKNOWN_COMMAND"],
  ];
  for (const [name, args, code] of cases) {
    test(`${name} exits 1 with ${code} on stderr`, async () => {
      const r = await runCLI(args);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toBe("");
      expect(err(r.stderr).code).toBe(code);
    });
  }
});

describe.skipIf(!process.env.LIVE)("live smoke test (Gupy)", () => {
  test("search returns real results and detail reads one", async () => {
    const out = parseJSON<{ meta: { count: number }; results: { id: string; title: string; url: string }[] }>(
      await runCLI(["search", "-q", "analista", "--limit", "3"]),
    );
    expect(out.meta.count).toBeGreaterThan(0);
    for (const r of out.results) {
      expect(r.id).toMatch(/^[a-z0-9-]+\/\d+$/i);
      expect(r.title).toBeTruthy();
      expect(r.url).toMatch(/^https:\/\/[a-z0-9-]+\.gupy\.io\/jobs\/\d+$/i);
    }
    const d = await runCLI(["detail", out.results[0].id, "--format", "plain"]);
    expect(d.exitCode).toBe(0);
    expect(d.stdout).toContain(out.results[0].url);
    expect(d.stdout).not.toMatch(/<\/?(p|li|span)\b/);
  });
});
