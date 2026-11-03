// Funções da Vercel (versão na internet do servidor.mjs). O arquivo começa com
// "_" para a Vercel não publicá-lo como endpoint.

export function json(status, corpo, cacheSegundos = 0) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // A CDN da Vercel guarda a resposta: a mesma busca, feita por muita gente,
      // vira uma consulta só à Gupy no período.
      'Cache-Control': cacheSegundos && status === 200
        ? `public, max-age=60, s-maxage=${cacheSegundos}, stale-while-revalidate=${cacheSegundos}`
        : 'no-store',
    },
  });
}

// Grava a vaga no cache do Supabase (schema imobempregos), se configurado.
// Opcional: sem SUPABASE_URL e SUPABASE_SECRET_KEY, não faz nada.
// A chave secreta fica só no servidor (variável de ambiente da Vercel), nunca na página.
export async function guardarVagaNoSupabase(vaga) {
  const base = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SECRET_KEY;
  if (!base || !chave) return;
  try {
    await fetch(base.replace(/\/$/, '') + '/rest/v1/vagas?on_conflict=url', {
      method: 'POST',
      headers: {
        apikey: chave,
        'Content-Type': 'application/json',
        'Content-Profile': 'imobempregos',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(vaga),
      signal: AbortSignal.timeout(4000),
    });
  } catch { /* cache é opcional: falha aqui não derruba a resposta */ }
}
