// Peças comuns das funções do site (Vercel Functions, em api/).
// Recebem `env` (process.env na Vercel; um objeto falso nos testes).
//
// Variáveis:
//   SUPABASE_URL              https://<ref>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  sb_publishable_...  (confere o login do usuário)
//   SUPABASE_SECRET_KEY       sb_secret_...       (só servidor: grava assinaturas e o cache de vagas)
//   ASAAS_API_KEY, ASAAS_AMBIENTE (sandbox|producao), ASAAS_WEBHOOK_TOKEN, SITE_URL

export function json(status, corpo, cacheSegundos = 0) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // "private": só o navegador de quem pediu guarda; a CDN nunca, porque a
      // resposta depende de quem está logado e se pagou.
      'Cache-Control': cacheSegundos && status === 200 ? `private, max-age=${cacheSegundos}` : 'no-store',
    },
  });
}

const base = (env) => String(env.SUPABASE_URL || '').replace(/\/$/, '');

function tokenDe(request) {
  const auth = request.headers.get('authorization') || '';
  return /^Bearer [A-Za-z0-9._-]+$/.test(auth) ? auth : null;
}

/** Quem está logado. Devolve { usuario } ou { resposta } com o erro. */
export async function usuarioDoToken(request, env, fetchImpl = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { resposta: json(500, { erro: 'Servidor sem configuração do Supabase.' }) };
  const auth = tokenDe(request);
  if (!auth) return { resposta: json(401, { erro: 'Entre na sua conta para continuar.' }) };
  try {
    const r = await fetchImpl(base(env) + '/auth/v1/user', {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { resposta: json(401, { erro: 'Sua sessão expirou. Entre de novo.' }) };
    const u = await r.json();
    return u && u.id ? { usuario: u } : { resposta: json(401, { erro: 'Sua sessão expirou. Entre de novo.' }) };
  } catch {
    return { resposta: json(503, { erro: 'Não foi possível conferir o login agora. Tente de novo.' }) };
  }
}

/**
 * Logado E com acesso (teste grátis ou mensalidade em dia)? Uma chamada só:
 * a função tem_acesso() roda com o token do usuário, então o Supabase confere
 * o token e o RLS garante que ela olha só a assinatura dele.
 * Sem SUPABASE_URL (teste local), libera. Devolve null se pode seguir.
 */
export async function exigirAcesso(request, env, fetchImpl = fetch) {
  if (!env.SUPABASE_URL) return null;
  if (!env.SUPABASE_PUBLISHABLE_KEY) return json(500, { erro: 'Servidor sem configuração do Supabase.' });
  const auth = tokenDe(request);
  if (!auth) return json(401, { erro: 'Entre na sua conta para buscar vagas.' });
  try {
    const r = await fetchImpl(base(env) + '/rest/v1/rpc/tem_acesso', {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth,
        'Content-Type': 'application/json', 'Content-Profile': 'imobempregos',
      },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 401 || r.status === 403) return json(401, { erro: 'Sua sessão expirou. Entre de novo.' });
    if (!r.ok) return json(503, { erro: 'Não foi possível conferir sua assinatura agora. Tente de novo.' });
    return (await r.json()) === true
      ? null
      : json(402, { erro: 'Seu teste grátis acabou. Assine por R$ 19,90 por mês para continuar.', assinar: true });
  } catch {
    return json(503, { erro: 'Não foi possível conferir sua assinatura agora. Tente de novo.' });
  }
}

/**
 * Supabase com a chave secreta (ignora o RLS). Só para o servidor.
 * caminho: ex. "assinaturas?usuario_id=eq.<uuid>&select=*"
 */
export async function admin(env, metodo, caminho, corpo, fetchImpl = fetch, prefer) {
  const chave = env.SUPABASE_SECRET_KEY;
  if (!env.SUPABASE_URL || !chave) throw new Error('Servidor sem SUPABASE_SECRET_KEY.');
  const headers = {
    apikey: chave,
    'Accept-Profile': 'imobempregos',
    'Content-Profile': 'imobempregos',
    'Content-Type': 'application/json',
  };
  // Chave antiga (JWT "service_role") também precisa ir no Authorization.
  if (chave.startsWith('eyJ')) headers.Authorization = 'Bearer ' + chave;
  if (prefer) headers.Prefer = prefer;
  const r = await fetchImpl(base(env) + '/rest/v1/' + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Supabase ${metodo} ${caminho.split('?')[0]}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (s) => UUID.test(String(s || ''));

export async function lerAssinatura(env, usuarioId, fetchImpl = fetch) {
  if (!ehUuid(usuarioId)) throw new Error('usuário inválido');
  const linhas = await admin(env, 'GET', `assinaturas?usuario_id=eq.${usuarioId}&select=*`, undefined, fetchImpl);
  return linhas && linhas[0] ? linhas[0] : null;
}

export async function atualizarAssinatura(env, usuarioId, mudancas, fetchImpl = fetch) {
  if (!ehUuid(usuarioId)) throw new Error('usuário inválido');
  await admin(env, 'PATCH', `assinaturas?usuario_id=eq.${usuarioId}`, mudancas, fetchImpl, 'return=minimal');
}

// Grava a vaga lida no cache do Supabase. Opcional: sem a chave secreta, não faz nada.
export async function guardarVagaNoSupabase(env, vaga, fetchImpl = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return;
  try {
    await admin(env, 'POST', 'vagas?on_conflict=url', vaga, fetchImpl, 'resolution=merge-duplicates,return=minimal');
  } catch { /* cache é opcional: falha aqui não derruba a resposta */ }
}
