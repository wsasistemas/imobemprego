# Gupy URL Reference

Public, unauthenticated pages used by this skill. Investigated 2026-11-03.

Both page types are Next.js server-rendered pages that embed their data as JSON in
`<script id="__NEXT_DATA__" type="application/json">`. The CLI reads that JSON; it
does not parse visible HTML.

## Access rules

| Host | robots.txt | Used paths |
|------|------------|------------|
| `portal.gupy.io` | `User-agent: * / Disallow:` (everything allowed) | `/job-search/...` |
| `<empresa>.gupy.io` | `Allow: /`, `Disallow: /companies`, `Disallow: /candidates` | `/jobs/<id>` |

The old JSON API (`employability-portal.gupy.io/api/v1/jobs`) returns 404 and is not used.

## Search

```
GET https://portal.gupy.io/job-search/term=<termo>[&state=<estado>][&page=<n>]
```

Filters go in the **path** (the `[pid]` route), joined with `&`, not in a query string.

| Param | Meaning | Example |
|-------|---------|---------|
| `term` | Free-text query (URL-encoded) | `analista%20fiscal` |
| `state` | Full state name (URL-encoded), not UF | `S%C3%A3o%20Paulo` |
| `page` | 1-indexed page, 12 results each | `2` |

`workplaceType=remote` is echoed back in `searchFilters` but **does not filter**
(tested: still returns on-site jobs), so the CLI filters workplace client-side.
`offset=` is ignored too. There is no posting-date parameter.

Response JSON path: `props.pageProps.initialJobList`

```json
{
  "pagination": { "total": 100, "limit": 12, "offset": 12 },
  "data": [{
    "id": 12803990,
    "name": "Analista Fiscal - GMO",
    "careerPageName": "recrutamentoGMO",
    "type": "vacancy_type_effective",
    "publishedDate": "2026-10-30T18:23:11.319Z",
    "applicationDeadline": "2026-12-28T00:00:00.000Z",
    "workplaceType": "on-site | remote | hybrid",
    "city": "Itajaí", "state": "Santa Catarina",
    "jobUrl": "https://gmofacilities.gupy.io/job/<base64 {jobId,source}>?jobBoardSource=gupy_portal",
    "disabilities": true,
    "description": "<company intro HTML>"
  }]
}
```

`total` is capped at 100. The company subdomain comes from the `jobUrl` hostname.

## Detail

```
GET https://<empresa>.gupy.io/jobs/<id>
```

The company subdomain is required: `https://gupy.io/jobs/<id>` is 404, and the
portal's `/job/<base64>` page renders client-side with no job data. A wrong or
removed id redirects to `/candidates/signin` (no `job` in the JSON).

Response JSON path: `props.pageProps.job`

| Field | Use |
|-------|-----|
| `name` | Title |
| `description` | "Descrição da vaga" (HTML) |
| `responsibilities` | "Responsabilidades e atribuições" (HTML) |
| `prerequisites` | "Requisitos e qualificações" (HTML) |
| `relevantExperiences` | "Informações adicionais" (HTML; benefits, schedule) |
| `publishedAt`, `registerEndDate` | Published date, application deadline |
| `addressCity`, `addressState`, `workplaceType`, `jobType`, `handicapped` | Location, mode, contract type, PcD |
| `jobSteps[].name` (sort by `order`) | Hiring stages |
| `status` | `published` when open |
| `careerPage.companyDescriptionTitle` | "Sobre a <Empresa>": best source for the company name |

HTML fields often come pasted from Word: raw newlines inside paragraphs and
bullets as separate `<p>·</p>` paragraphs. `cleanHtml` collapses whitespace first
and then rebuilds breaks from tags.

## Job type codes

`vacancy_type_effective` Efetivo (CLT) · `vacancy_legal_entity` PJ ·
`vacancy_type_internship` Estágio · `vacancy_type_apprentice` Jovem aprendiz ·
`vacancy_type_talent_pool` Banco de talentos · `vacancy_type_temporary` Temporário ·
`vacancy_type_trainee` Trainee · `vacancy_type_freelancer` Freelancer ·
`vacancy_type_autonomous` Autônomo · `vacancy_type_associate` Associado ·
`vacancy_type_lecturer` Docente · `vacancy_type_summer` Temporada
