import { canonicalUrl, detailToPlain, htmlFetch, parseDetail, resolveJobRef, writeError } from "../helpers.ts"

export interface DetailOpts {
  ref: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = resolveJobRef(opts.ref)
  if (!ref) {
    writeError(
      /^\d+$/.test(opts.ref.trim())
        ? "a bare numeric id is not enough on Gupy: each job lives on its company's subdomain. Pass the id from search (\"empresa/12345\") or the job URL"
        : `not a Gupy job reference: "${opts.ref}". Use "empresa/12345" or https://empresa.gupy.io/jobs/12345`,
      "BAD_REF",
    )
    return 1
  }
  try {
    const html = await htmlFetch(canonicalUrl(ref.sub, ref.jobId))
    const detail = html ? parseDetail(html, ref.sub, ref.jobId) : null
    if (!detail) {
      writeError(`job ${ref.sub}/${ref.jobId} not found (removed, closed, or wrong company)`, "NOT_FOUND")
      return 1
    }
    process.stdout.write(opts.format === "plain" ? detailToPlain(detail) + "\n" : JSON.stringify(detail, null, 2) + "\n")
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
