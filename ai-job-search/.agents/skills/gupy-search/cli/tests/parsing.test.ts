// Offline tests. Fixtures are synthetic, shaped like the real __NEXT_DATA__
// payloads documented in ../url-reference.md (fields checked 2026-11-03).
import { describe, test, expect } from "bun:test";
import { nextPage } from "./helpers";
import {
  cleanHtml,
  parseDetail,
  parseSearch,
  resolveJobRef,
  resolveState,
  detailToPlain,
} from "../src/helpers.ts";
import { applyFilters, buildUrl } from "../src/commands/search.ts";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64");

const SEARCH = nextPage({
  initialJobList: {
    pagination: { total: 100, limit: 12, offset: 0 },
    data: [
      {
        id: 111, name: "Analista Fiscal &amp; Tributário", careerPageName: "Empresa Exemplo",
        type: "vacancy_type_effective", publishedDate: "2026-10-30T18:23:11.319Z",
        applicationDeadline: "2026-12-28T00:00:00.000Z", workplaceType: "hybrid",
        city: "Campinas", state: "São Paulo", disabilities: true,
        jobUrl: `https://exemplo.gupy.io/job/${b64({ jobId: 111, source: "gupy_portal" })}?jobBoardSource=gupy_portal`,
      },
      {
        id: 222, name: "Desenvolvedor Python", careerPageName: "Outra",
        type: "vacancy_legal_entity", publishedDate: "2026-09-01T10:00:00.000Z",
        applicationDeadline: null, workplaceType: "remote", city: "", state: "", disabilities: false,
        jobUrl: "https://outra.gupy.io/job/abc?jobBoardSource=gupy_portal",
      },
      // Malformed entries are skipped, not fatal.
      { id: 333, name: "Sem URL" },
      { id: 444, name: "URL fora da Gupy", jobUrl: "https://evil.example.com/job/1" },
    ],
  },
});

describe("parseSearch", () => {
  const page = parseSearch(SEARCH);

  test("keeps valid jobs and skips malformed ones", () => {
    expect(page.total).toBe(100);
    expect(page.results.map((r) => r.id)).toEqual(["exemplo/111", "outra/222"]);
  });

  test("maps fields to the portal contract", () => {
    const [a, b] = page.results;
    expect(a).toEqual({
      id: "exemplo/111",
      title: "Analista Fiscal & Tributário",
      company: "Empresa Exemplo",
      location: "Campinas - SP",
      date: "2026-10-30",
      deadline: "2026-12-28",
      workplace: "hybrid",
      type: "Efetivo (CLT)",
      pcd: true,
      url: "https://exemplo.gupy.io/jobs/111",
    });
    expect(b.location).toBe("Remoto");
    expect(b.deadline).toBeNull();
    expect(b.type).toBe("PJ");
  });

  test("throws a clear error when the page format changes", () => {
    expect(() => parseSearch("<html>nothing</html>")).toThrow(/format changed/);
  });
});

describe("filters and URL", () => {
  const cards = parseSearch(SEARCH).results;

  test("path-encoded search URL", () => {
    expect(buildUrl({ query: " analista fiscal ", state: "São Paulo", page: 2 })).toBe(
      "https://portal.gupy.io/job-search/term=analista%20fiscal&state=S%C3%A3o%20Paulo&page=2",
    );
    expect(buildUrl({ query: "x", page: 1 })).toBe("https://portal.gupy.io/job-search/term=x");
  });

  test("--remote and --jobage filter client-side", () => {
    expect(applyFilters(cards, { remote: "remote" }).map((c) => c.id)).toEqual(["outra/222"]);
    const today = new Date("2026-11-03T12:00:00Z");
    expect(applyFilters(cards, { jobage: 14 }, today).map((c) => c.id)).toEqual(["exemplo/111"]);
    expect(applyFilters(cards, { limit: 1 })).toHaveLength(1);
  });

  test("state accepts UF or name, with or without accents", () => {
    expect(resolveState("sp")).toBe("São Paulo");
    expect(resolveState("sao paulo")).toBe("São Paulo");
    expect(resolveState("Minas Gerais")).toBe("Minas Gerais");
    expect(resolveState("Lisboa")).toBeNull();
  });
});

describe("resolveJobRef", () => {
  test("accepts search ids and both URL shapes", () => {
    expect(resolveJobRef("exemplo/111")).toEqual({ sub: "exemplo", jobId: "111" });
    expect(resolveJobRef("https://exemplo.gupy.io/jobs/111?x=1")).toEqual({ sub: "exemplo", jobId: "111" });
    expect(resolveJobRef(`https://exemplo.gupy.io/job/${b64({ jobId: 111 })}?jobBoardSource=gupy_portal`)).toEqual({
      sub: "exemplo",
      jobId: "111",
    });
  });

  test("rejects bare ids and non-Gupy hosts", () => {
    expect(resolveJobRef("111")).toBeNull();
    expect(resolveJobRef("https://gupy.io.evil.com/jobs/1")).toBeNull();
    expect(resolveJobRef("http://exemplo.gupy.io/jobs/1")).toBeNull();
  });
});

describe("parseDetail", () => {
  const DETAIL = nextPage({
    job: {
      id: 111,
      name: "Analista Fiscal",
      description: "<p>Somos uma\nempresa   exemplo.</p>",
      responsibilities: "<p>·</p><p>Apurar ICMS;</p><p>·</p><p>Entregar\nobrigações.</p>",
      prerequisites: "<ul><li>Excel avançado</li><li>Inglês intermediário</li></ul>",
      relevantExperiences: "<p>Vale-refeição&nbsp;e plano de saúde</p>",
      publishedAt: "2026-10-30T18:23:11.319Z",
      registerEndDate: "2026-12-28",
      addressCity: "Campinas",
      addressState: "São Paulo",
      workplaceType: "on-site",
      jobType: "vacancy_type_effective",
      handicapped: false,
      status: "published",
      jobSteps: [
        { name: "Entrevista", order: 1 },
        { name: "Cadastro", order: 0 },
      ],
      careerPage: { name: "Página de Carreiras", companyDescriptionTitle: "Sobre a Empresa Exemplo", subdomain: "exemplo" },
    },
  });

  test("extracts sections as readable text", () => {
    const d = parseDetail(DETAIL, "exemplo", "111")!;
    expect(d.company).toBe("Empresa Exemplo");
    expect(d.description).toBe("Somos uma empresa exemplo.");
    expect(d.responsibilities).toBe("- Apurar ICMS;\n- Entregar obrigações.");
    expect(d.requirements).toBe("- Excel avançado\n- Inglês intermediário");
    expect(d.additional).toBe("Vale-refeição e plano de saúde");
    expect(d.steps).toEqual(["Cadastro", "Entrevista"]);
    expect(d.isActive).toBe(true);
    expect(d.location).toBe("Campinas - SP");
    expect(d.workplace).toBe("onsite");
  });

  test("plain output uses Gupy's section titles", () => {
    const text = detailToPlain(parseDetail(DETAIL, "exemplo", "111")!);
    for (const t of ["Descrição da vaga", "Responsabilidades e atribuições", "Requisitos e qualificações", "Informações adicionais"]) {
      expect(text).toContain(t);
    }
  });

  test("missing or mismatched job is null (Gupy redirects removed jobs to sign-in)", () => {
    expect(parseDetail(nextPage({ subdomain: "exemplo" }), "exemplo", "111")).toBeNull();
    expect(parseDetail(DETAIL, "exemplo", "999")).toBeNull();
  });
});

test("cleanHtml decodes entities, including astral code points", () => {
  expect(cleanHtml("<b>R&#36; 3.000</b> &#x1F600; &amp; mais")).toBe("R$ 3.000 😀 & mais");
});
