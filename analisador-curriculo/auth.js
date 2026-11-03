/*
 * Login do ImobEmpregos (Supabase Auth). Usado por entrar.html e index.html.
 * Precisa de: supabase-js (UMD, window.supabase), config.js (window.IMOB_CONFIG).
 *
 * Sem config.js preenchido:
 *   - em localhost, o app abre sem login ("modo local", para uso pessoal);
 *   - em qualquer outro endereço, entrar.html avisa que o app não está configurado.
 */
(function () {
  'use strict';
  const cfg = window.IMOB_CONFIG || {};
  const configurado = !!(cfg.supabaseUrl && cfg.supabasePublishableKey);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let cliente = null;

  function obterCliente() {
    if (!configurado) return null;
    if (!window.supabase || !window.supabase.createClient) throw new Error('Não foi possível carregar o login. Verifique a internet.');
    if (!cliente) {
      cliente = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return cliente;
  }

  async function sessao() {
    const c = obterCliente();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data.session || null;
  }

  const nuncaResolve = () => new Promise(function () {});

  /** Para páginas internas: volta para entrar.html se não houver sessão. */
  async function exigirLogin() {
    if (!configurado) {
      if (local) return { modoLocal: true };
      location.replace('entrar.html');
      return nuncaResolve();
    }
    const s = await sessao();
    if (!s) {
      location.replace('entrar.html');
      return nuncaResolve();
    }
    obterCliente().auth.onAuthStateChange(function (evento) {
      if (evento === 'SIGNED_OUT') location.replace('entrar.html');
    });
    return { sessao: s };
  }

  async function perfil() {
    const c = obterCliente();
    if (!c) return null;
    const { data, error } = await c.schema('imobempregos').from('perfis').select('nome, whatsapp').maybeSingle();
    return error ? null : data;
  }

  async function sair() {
    const c = obterCliente();
    if (c) await c.auth.signOut();
    location.replace('entrar.html');
  }

  /** A linha da assinatura do usuário logado (o RLS só deixa ver a própria). */
  async function assinatura() {
    const c = obterCliente();
    if (!c) return null;
    const { data, error } = await c.schema('imobempregos').from('assinaturas').select('*').maybeSingle();
    if (error) throw new Error('Não foi possível ler sua assinatura.');
    return data;
  }

  /**
   * fetch para /api/... levando o token da sessão (as funções do site exigem login).
   * 402 = teste acabou / mensalidade não paga: leva para a tela de assinatura.
   */
  async function fetchApi(url, opcoes) {
    const s = await sessao();
    opcoes = opcoes || {};
    const headers = Object.assign({}, opcoes.headers || {}, s ? { Authorization: 'Bearer ' + s.access_token } : {});
    const r = await fetch(url, Object.assign({}, opcoes, { headers: headers }));
    if (r.status === 402) location.href = 'assinatura.html';
    return r;
  }

  async function postApi(url, corpo) {
    const r = await fetchApi(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    const dados = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(dados.erro || 'Erro ' + r.status);
    return dados;
  }

  window.ImobAuth = {
    configurado: configurado, local: local, obterCliente: obterCliente, sessao: sessao, exigirLogin: exigirLogin,
    perfil: perfil, assinatura: assinatura, sair: sair, fetchApi: fetchApi, postApi: postApi,
  };
})();
