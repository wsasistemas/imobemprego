// Testes das funções do site (assinatura, Asaas, acesso). Sem rede: Supabase e
// Asaas são simulados por um fetch falso.
//   node --test teste.mjs teste-servidor.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { exigirAcesso } from './lib/servidor/comum.mjs';
import {
  processarEvento, acessoAteParaVencimento, primeiroVencimento, filtroDasChaves, tokenConfere, PRECO,
} from './lib/servidor/asaas.mjs';
import { assinar, cancelar, webhookAsaas } from './lib/servidor/acoes.mjs';
import { gerarDocumentos, ehPagante, ErroIA, LIMITE_IA_MES } from './lib/servidor/ia.mjs';
import { lerLink, extrairVagaDeHtml, conferirUrl, baixarPagina, ipPrivado, ErroLink } from './lib/servidor/link.mjs';

const V = createRequire(import.meta.url)('./validacao.js');

const ENV = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
  SUPABASE_SECRET_KEY: 'sb_secret_teste',
  ASAAS_API_KEY: '$aact_teste',
  ASAAS_AMBIENTE: 'sandbox',
  ASAAS_WEBHOOK_TOKEN: 'w'.repeat(40),
  SITE_URL: 'https://imobempregos.pages.dev',
};
const UID = '11111111-1111-1111-1111-111111111111';
const CPF = '529.982.247-25';

/** fetch falso: rotas [regex, método, resposta | (url, corpo) => resposta]; guarda as chamadas. */
function fetchFalso(rotas) {
  const chamadas = [];
  const f = async (url, opts = {}) => {
    const metodo = opts.method || 'GET';
    const corpo = opts.body ? JSON.parse(opts.body) : undefined;
    chamadas.push({ url: String(url), metodo, corpo, headers: opts.headers || {} });
    for (const [re, m, resp] of rotas) {
      if (m === metodo && re.test(String(url))) {
        const r = typeof resp === 'function' ? resp(String(url), corpo) : resp;
        return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status || 200 });
      }
    }
    throw new Error('rota não prevista: ' + metodo + ' ' + url);
  };
  f.chamadas = chamadas;
  f.de = (re, metodo) => chamadas.filter((c) => re.test(c.url) && (!metodo || c.metodo === metodo));
  return f;
}

const comToken = (url, init = {}) => new Request(url, { ...init, headers: { Authorization: 'Bearer tok.en', ...(init.headers || {}) } });
const usuario = [/\/auth\/v1\/user$/, 'GET', { body: { id: UID, email: 'ana@exemplo.com', user_metadata: { nome: 'Ana Souza' } } }];
const linha = (extra) => ({ usuario_id: UID, status: 'teste', teste_ate: '2099-01-10T12:00:00Z', acesso_ate: null, forma: null, asaas_cliente_id: null, asaas_assinatura_id: null, fatura_url: null, ...extra });

// ------------------------------------------------------------------ regras puras

test('CPF: dígitos verificadores e máscara', () => {
  assert.equal(V.normalizarCpf(CPF), '52998224725');
  assert.equal(V.normalizarCpf('529.982.247-24'), null);
  assert.equal(V.normalizarCpf('111.111.111-11'), null);
  assert.equal(V.mascararCpf('52998224725'), '529.982.247-25');
});

test('situação da assinatura: o que a tela mostra', () => {
  const agora = new Date('2026-11-05T12:00:00Z');
  const s = (a) => V.situacaoAssinatura(a, agora);
  assert.deepEqual([s(linha({ teste_ate: '2026-11-13T12:00:00Z' })).tipo, s(linha({ teste_ate: '2026-11-13T12:00:00Z' })).diasTeste], ['teste', 8]);
  assert.equal(s(linha({ teste_ate: '2026-11-04T12:00:00Z' })).tipo, 'bloqueado');
  assert.equal(s(linha({ teste_ate: '2026-11-04T12:00:00Z' })).acesso, false);
  assert.equal(s(linha({ status: 'ativa', teste_ate: '2026-11-01T00:00:00Z', acesso_ate: '2026-12-10T00:00:00Z' })).tipo, 'ativa');
  assert.equal(s(linha({ status: 'ativa', teste_ate: '2026-11-13T00:00:00Z' })).acesso, true, 'cartão cadastrado no teste');
  const canc = s(linha({ status: 'cancelada', teste_ate: '2026-11-01T00:00:00Z', acesso_ate: '2026-11-20T00:00:00Z' }));
  assert.equal(canc.tipo, 'cancelada');
  assert.equal(canc.acesso, true, 'cancelou: usa até o fim do pago');
  assert.equal(s(linha({ status: 'atrasada', teste_ate: '2026-11-01T00:00:00Z' })).acesso, false);
  assert.equal(s(null).acesso, false);
});

test('datas: acesso até vencimento + 1 mês + 3 dias; primeiro vencimento no fim do teste', () => {
  assert.equal(acessoAteParaVencimento('2026-11-10'), '2026-12-13T23:59:59.000Z');
  assert.equal(acessoAteParaVencimento('2027-01-31'), '2027-03-03T23:59:59.000Z', '31/01 -> fim de fevereiro + 3');
  assert.equal(acessoAteParaVencimento('lixo'), null);
  const agora = new Date('2026-11-05T15:00:00Z');
  assert.equal(primeiroVencimento('2026-11-15T12:00:00Z', agora), '2026-11-15', 'no teste: vence quando o teste acaba');
  assert.equal(primeiroVencimento('2026-11-01T12:00:00Z', agora), '2026-11-05', 'teste acabou: vence hoje');
  assert.equal(primeiroVencimento('2026-11-06T01:00:00Z', agora), '2026-11-05', 'fuso de Brasília');
});

test('webhook: cada evento vira a mudança certa', () => {
  const agora = new Date('2026-11-05T12:00:00Z');
  const pago = processarEvento({ event: 'PAYMENT_CONFIRMED', payment: { customer: 'cus_1', subscription: 'sub_1', billingType: 'PIX', dueDate: '2026-11-10' } }, agora);
  assert.deepEqual(pago.chaves, { assinatura: 'sub_1', cliente: 'cus_1' });
  assert.deepEqual(pago.mudancas, { status: 'ativa', forma: 'PIX', asaas_assinatura_id: 'sub_1', fatura_url: null });
  assert.equal(pago.estenderAte, '2026-12-13T23:59:59.000Z');
  assert.equal(processarEvento({ event: 'PAYMENT_CREATED', payment: { customer: 'cus_1', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/abc' } }).mudancas.fatura_url, 'https://sandbox.asaas.com/i/abc');
  assert.equal(processarEvento({ event: 'PAYMENT_CREATED', payment: { customer: 'cus_1', billingType: 'PIX', invoiceUrl: 'https://golpe.com/pix' } }), null, 'link fora do Asaas é ignorado');
  assert.equal(processarEvento({ event: 'PAYMENT_OVERDUE', payment: { customer: 'cus_1' } }).mudancas.status, 'atrasada');
  assert.equal(processarEvento({ event: 'PAYMENT_REFUNDED', payment: { customer: 'cus_1' } }, agora).mudancas.acesso_ate, agora.toISOString());
  assert.equal(processarEvento({ event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_1', customer: 'cus_1' } }).mudancas.status, 'cancelada');
  assert.deepEqual(processarEvento({ event: 'CHECKOUT_PAID', checkout: { id: 'chk-1' } }).chaves, { checkout: 'chk-1' });
  assert.equal(processarEvento({ event: 'PAYMENT_UPDATED', payment: {} }), null);
  assert.equal(processarEvento({}), null);
});

test('webhook: IDs estranhos não entram no filtro do banco; token em tempo constante', () => {
  assert.equal(filtroDasChaves({ cliente: 'cus_1', assinatura: 'x,usuario_id.neq.0' }), 'or=(asaas_cliente_id.eq.cus_1)');
  assert.equal(filtroDasChaves({ cliente: '..' }), null);
  assert.equal(tokenConfere('abc', 'abc'), true);
  assert.equal(tokenConfere('abd', 'abc'), false);
  assert.equal(tokenConfere('', ''), false, 'sem token configurado nunca confere');
});

// ------------------------------------------------------------------ acesso às buscas

test('acesso: só logado e com teste ou mensalidade em dia', async () => {
  assert.equal(await exigirAcesso(new Request('https://x/api/vagas'), {}), null, 'sem Supabase (local): libera');
  const rpc = (status, body) => fetchFalso([[/rpc\/tem_acesso$/, 'POST', { status, body }]]);
  assert.equal((await exigirAcesso(new Request('https://x/api/vagas'), ENV, rpc(200, true))).status, 401, 'sem token');
  const f = rpc(200, true);
  assert.equal(await exigirAcesso(comToken('https://x/api/vagas'), ENV, f), null);
  assert.equal(f.chamadas[0].headers['Content-Profile'], 'imobempregos');
  assert.equal(f.chamadas[0].headers.Authorization, 'Bearer tok.en', 'a função roda com o token do usuário (RLS)');
  const negado = await exigirAcesso(comToken('https://x/api/vagas'), ENV, rpc(200, false));
  assert.equal(negado.status, 402);
  assert.equal((await negado.json()).assinar, true);
  assert.equal((await exigirAcesso(comToken('https://x/api/vagas'), ENV, rpc(401, {}))).status, 401);
});

// ------------------------------------------------------------------ assinar

test('assinar com Pix: cria cliente e assinatura no Asaas e devolve o link da cobrança', async () => {
  const f = fetchFalso([
    usuario,
    [/rest\/v1\/assinaturas\?usuario_id=eq\.[^&]+&select/, 'GET', { body: [linha()] }],
    [/rest\/v1\/perfis\?/, 'GET', { body: [{ nome: 'Ana Souza', whatsapp: '5511912345678' }] }],
    [/rest\/v1\/assinaturas\?usuario_id=eq\./, 'PATCH', { body: undefined }],
    [/\/v3\/customers$/, 'POST', { body: { id: 'cus_abc' } }],
    [/\/v3\/subscriptions$/, 'POST', { body: { id: 'sub_abc' } }],
    [/\/v3\/subscriptions\/sub_abc\/payments/, 'GET', { body: { data: [{ id: 'pay_1', invoiceUrl: 'https://sandbox.asaas.com/i/pay1' }] } }],
  ]);
  const r = await assinar(comToken('https://x/api/assinar', { method: 'POST', body: JSON.stringify({ forma: 'PIX', cpf: CPF }) }), ENV, f);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, 'https://sandbox.asaas.com/i/pay1');
  const cliente = f.de(/\/v3\/customers$/)[0];
  assert.equal(cliente.headers.access_token, '$aact_teste');
  assert.deepEqual([cliente.corpo.cpfCnpj, cliente.corpo.mobilePhone, cliente.corpo.externalReference], ['52998224725', '11912345678', UID]);
  const sub = f.de(/\/v3\/subscriptions$/)[0].corpo;
  assert.deepEqual([sub.billingType, sub.value, sub.cycle, sub.nextDueDate], ['PIX', PRECO, 'MONTHLY', '2099-01-10'], 'no teste: vence quando o teste acaba');
  assert.ok(f.chamadas.filter((c) => /supabase/.test(c.url)).every((c) => !JSON.stringify(c.corpo || '').includes('52998224725')), 'CPF nunca vai para o nosso banco');
  assert.ok(f.de(/assinaturas/, 'PATCH').some((c) => c.corpo.fatura_url === 'https://sandbox.asaas.com/i/pay1'));
});

test('assinar com cartão: abre o Checkout recorrente do Asaas', async () => {
  const f = fetchFalso([
    usuario,
    [/rest\/v1\/assinaturas\?usuario_id=eq\.[^&]+&select/, 'GET', { body: [linha({ asaas_cliente_id: 'cus_abc' })] }],
    [/rest\/v1\/assinaturas\?usuario_id=eq\./, 'PATCH', { body: undefined }],
    [/\/v3\/checkouts$/, 'POST', { body: { id: 'c7b1c696-b27b-4d3d-80b9-d1c018e387f8' } }],
  ]);
  const r = await assinar(comToken('https://x/api/assinar', { method: 'POST', body: JSON.stringify({ forma: 'CREDIT_CARD', cpf: CPF }) }), ENV, f);
  assert.equal((await r.json()).url, 'https://sandbox.asaas.com/checkoutSession/show?id=c7b1c696-b27b-4d3d-80b9-d1c018e387f8');
  const ck = f.de(/\/v3\/checkouts$/)[0].corpo;
  assert.deepEqual(ck.billingTypes, ['CREDIT_CARD']);
  assert.deepEqual(ck.chargeTypes, ['RECURRENT']);
  assert.equal(ck.customer, 'cus_abc', 'reaproveita o cliente');
  assert.equal(ck.items[0].value, PRECO);
  assert.equal(ck.subscription.cycle, 'MONTHLY');
  assert.equal(ck.callback.successUrl, 'https://imobempregos.pages.dev/assinatura.html?r=ok');
  assert.equal(f.de(/\/v3\/customers/).length, 0);
});

test('assinar: recusa CPF inválido, forma inválida e quem já assinou', async () => {
  const f = fetchFalso([usuario, [/rest\/v1\/assinaturas\?/, 'GET', { body: [linha({ status: 'ativa', asaas_assinatura_id: 'sub_1', forma: 'CREDIT_CARD' })] }]]);
  const pedir = (corpo) => assinar(comToken('https://x/api/assinar', { method: 'POST', body: JSON.stringify(corpo) }), ENV, f);
  assert.equal((await pedir({ forma: 'PIX', cpf: '123' })).status, 400);
  assert.equal((await pedir({ forma: 'BOLETO', cpf: CPF })).status, 400);
  assert.equal((await pedir({ forma: 'PIX', cpf: CPF })).status, 409);
  assert.equal(f.de(/asaas\.com/).length, 0, 'nenhuma chamada ao Asaas');
  assert.equal((await assinar(new Request('https://x/api/assinar', { method: 'POST', body: '{}' }), ENV, f)).status, 401, 'sem login');
});

// ------------------------------------------------------------------ cancelar

test('cancelar: encerra no Asaas e marca cancelada', async () => {
  const f = fetchFalso([
    usuario,
    [/rest\/v1\/assinaturas\?usuario_id=eq\.[^&]+&select/, 'GET', { body: [linha({ status: 'ativa', asaas_assinatura_id: 'sub_abc', acesso_ate: '2099-02-01T00:00:00Z' })] }],
    [/rest\/v1\/assinaturas\?usuario_id=eq\./, 'PATCH', { body: undefined }],
    [/\/v3\/subscriptions\/sub_abc$/, 'DELETE', { body: { deleted: true } }],
  ]);
  const r = await cancelar(comToken('https://x/api/cancelar', { method: 'POST' }), ENV, f);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).acesso_ate, '2099-02-01T00:00:00Z');
  assert.equal(f.de(/assinaturas/, 'PATCH')[0].corpo.status, 'cancelada');
  assert.equal(f.de(/assinaturas/, 'PATCH')[0].corpo.acesso_ate, undefined, 'não mexe no período pago');
});

// ------------------------------------------------------------------ webhook

const evento = (corpo, token = ENV.ASAAS_WEBHOOK_TOKEN) =>
  new Request('https://x/api/asaas-webhook', { method: 'POST', headers: { 'asaas-access-token': token }, body: JSON.stringify(corpo) });

test('webhook: recusa token errado', async () => {
  const f = fetchFalso([]);
  assert.equal((await webhookAsaas(evento({ id: 'evt_1' }, 'errado'), ENV, f)).status, 403);
  assert.equal((await webhookAsaas(evento({ id: 'evt_1' }), { ...ENV, ASAAS_WEBHOOK_TOKEN: '' }, f)).status, 500, 'sem token configurado não processa');
  assert.equal(f.chamadas.length, 0);
});

test('webhook: pagamento estende o acesso (nunca encurta) e grava o evento', async () => {
  const rotas = (acessoAtual) => fetchFalso([
    [/eventos_asaas\?id=eq\./, 'GET', { body: [] }],
    [/assinaturas\?or=/, 'GET', { body: [{ usuario_id: UID, acesso_ate: acessoAtual }] }],
    [/assinaturas\?usuario_id=eq\./, 'PATCH', { body: undefined }],
    [/eventos_asaas\?on_conflict/, 'POST', { body: undefined }],
  ]);
  const pago = { id: 'evt_9', event: 'PAYMENT_RECEIVED', payment: { customer: 'cus_abc', subscription: 'sub_abc', billingType: 'PIX', dueDate: '2026-11-10' } };
  let f = rotas(null);
  let r = await webhookAsaas(evento(pago), ENV, f);
  assert.deepEqual(await r.json(), { ok: true, aplicado: true });
  const patch = f.de(/assinaturas\?usuario_id/, 'PATCH')[0].corpo;
  assert.equal(patch.status, 'ativa');
  assert.equal(patch.acesso_ate, '2026-12-13T23:59:59.000Z');
  assert.equal(f.de(/eventos_asaas\?on_conflict/, 'POST')[0].corpo.id, 'evt_9');
  assert.match(f.de(/assinaturas\?or=/)[0].url, /or=\(asaas_assinatura_id\.eq\.sub_abc,asaas_cliente_id\.eq\.cus_abc\)/);

  f = rotas('2027-06-01T00:00:00Z');
  await webhookAsaas(evento(pago), ENV, f);
  assert.equal(f.de(/assinaturas\?usuario_id/, 'PATCH')[0].corpo.acesso_ate, undefined, 'pagamento antigo não encurta o acesso');
});

test('webhook: evento repetido é ignorado; cliente desconhecido responde 200', async () => {
  let f = fetchFalso([[/eventos_asaas\?id=eq\./, 'GET', { body: [{ id: 'evt_9' }] }]]);
  assert.deepEqual(await (await webhookAsaas(evento({ id: 'evt_9', event: 'PAYMENT_RECEIVED', payment: { customer: 'cus_abc' } }), ENV, f)).json(), { ok: true, repetido: true });
  f = fetchFalso([
    [/eventos_asaas\?id=eq\./, 'GET', { body: [] }],
    [/assinaturas\?or=/, 'GET', { body: [] }],
    [/eventos_asaas\?on_conflict/, 'POST', { body: undefined }],
  ]);
  const r = await webhookAsaas(evento({ id: 'evt_10', event: 'PAYMENT_RECEIVED', payment: { customer: 'cus_outro', dueDate: '2026-11-10' } }), ENV, f);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).aplicado, false);
});

test('webhook: falha no banco devolve 500 para o Asaas reenviar', async () => {
  const f = fetchFalso([[/eventos_asaas\?id=eq\./, 'GET', { status: 503, body: { message: 'fora do ar' } }]]);
  const r = await webhookAsaas(evento({ id: 'evt_11', event: 'PAYMENT_RECEIVED', payment: {} }), ENV, f);
  assert.equal(r.status, 500);
});

// ------------------------------------------------------------------ busca de vagas e funções da Vercel
import { buscarVagas, lerVaga } from './lib/servidor/vagas.mjs';
import { GET as apiVagas } from '../api/vagas.mjs';
import { POST as apiWebhook } from '../api/asaas-webhook.mjs';

const paginaGupy = (pageProps) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></html>`;

test('busca: sem acesso (402) nem chega a consultar a Gupy', async () => {
  const f = fetchFalso([[/rpc\/tem_acesso$/, 'POST', { body: false }]]);
  const r = await buscarVagas(comToken('https://x/api/vagas?termo=analista'), ENV, f);
  assert.equal(r.status, 402);
  assert.equal(f.de(/gupy\.io/).length, 0);
});

test('busca: com acesso, consulta a Gupy e devolve as vagas', async () => {
  const f = fetchFalso([
    [/rpc\/tem_acesso$/, 'POST', { body: true }],
    [/portal\.gupy\.io\/job-search\/term=analista&state=Paran%C3%A1$/, 'GET', { body: undefined }],
  ]);
  // A rota da Gupy devolve HTML, não JSON: troca a resposta por uma página com __NEXT_DATA__.
  const html = paginaGupy({ initialJobList: { pagination: { total: 1 }, data: [{ id: 7, name: 'Analista', jobUrl: 'https://empresa.gupy.io/job/x' }] } });
  const fComHtml = async (url, opts) => (/gupy\.io/.test(url) ? new Response(html) : f(url, opts));
  const r = await buscarVagas(comToken('https://x/api/vagas?termo=analista&estado=Paran%C3%A1'), ENV, fComHtml);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, max-age=600');
  assert.equal((await r.json()).vagas[0].url, 'https://empresa.gupy.io/jobs/7');
});

test('vaga: link fora da Gupy é recusado antes de qualquer consulta', async () => {
  const f = fetchFalso([[/rpc\/tem_acesso$/, 'POST', { body: true }]]);
  const r = await lerVaga(comToken('https://x/api/vaga?url=' + encodeURIComponent('https://evil.com/jobs/1')), ENV, f);
  assert.equal(r.status, 400);
});

test('funções da Vercel: usam process.env', async () => {
  const antes = { ...process.env };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    assert.equal((await apiVagas(new Request('https://x/api/vagas'))).status, 400, 'sem termo');
    assert.equal((await apiWebhook(new Request('https://x/api/asaas-webhook', { method: 'POST', body: '{}' }))).status, 500, 'sem token configurado não processa');
  } finally {
    process.env = antes;
  }
});

// ------------------------------------------------------------------ IA (currículo e carta)

const ENV_IA = { ...ENV, ANTHROPIC_API_KEY: 'sk-ant-teste' };
const CV = 'Ana Souza\nSão Paulo - SP\n' + 'Assistente fiscal com experiência em NF-e e SPED. '.repeat(8);
const VAGA = 'Analista Fiscal Jr. Requisitos: SPED Fiscal, ICMS, conciliação de notas. '.repeat(3);
const pedidoIA = (corpo) => comToken('https://x/api/gerar', { method: 'POST', body: JSON.stringify(corpo) });
const RESPOSTA_IA = { curriculo: 'ANA SOUZA\n⟦Resumo novo⟧', carta: 'Olá, equipe...', mudancas: ['Resumo'], alertas: [] };
const ia = (resp) => { const f = async (env, d) => { f.chamadas.push(d); if (resp instanceof Error) throw resp; return resp; }; f.chamadas = []; return f; };
const assinaturaIA = (extra) => [/\/rest\/v1\/assinaturas\?/, 'GET', { body: [linha(extra)] }];
const PAGO = { status: 'ativa', acesso_ate: '2099-01-01T00:00:00Z' };

test('IA: pagante gera currículo e carta e o uso é contado', async () => {
  const f = fetchFalso([usuario, assinaturaIA(PAGO), [/rpc\/consumir_uso_ia$/, 'POST', { body: 3 }]]);
  const chamar = ia(RESPOSTA_IA);
  const r = await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV_IA, f, chamar);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual([d.curriculo, d.usos, d.limite], [RESPOSTA_IA.curriculo, 3, LIMITE_IA_MES]);
  assert.equal(chamar.chamadas[0].curriculo, CV.trim(), 'o currículo vai para a IA');
  assert.deepEqual(f.de(/rpc\/consumir_uso_ia$/)[0].corpo, { p_usuario: UID, p_limite: 25 });
  assert.equal(LIMITE_IA_MES, 25);
});

test('IA: teste grátis não usa (nem conta uso)', async () => {
  const f = fetchFalso([usuario, assinaturaIA({ teste_ate: '2099-01-10T12:00:00Z' })]);
  const chamar = ia(RESPOSTA_IA);
  const r = await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV_IA, f, chamar);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).assinar, true);
  assert.equal(chamar.chamadas.length, 0);
  assert.equal(f.de(/consumir_uso_ia/).length, 0);
});

test('IA: assinou mas ainda não pagou (cartão no teste) não usa', async () => {
  const f = fetchFalso([usuario, assinaturaIA({ status: 'ativa', teste_ate: '2099-01-10T12:00:00Z', acesso_ate: null })]);
  assert.equal((await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV_IA, f, ia(RESPOSTA_IA))).status, 403);
});

test('IA: passou de 25 no mês é recusado sem chamar a IA', async () => {
  const f = fetchFalso([usuario, assinaturaIA(PAGO), [/rpc\/consumir_uso_ia$/, 'POST', { body: -1 }]]);
  const chamar = ia(RESPOSTA_IA);
  const r = await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV_IA, f, chamar);
  assert.equal(r.status, 429);
  assert.match((await r.json()).erro, /25 gerações/);
  assert.equal(chamar.chamadas.length, 0);
});

test('IA: falhou depois de contar, o uso é devolvido', async () => {
  const f = fetchFalso([usuario, assinaturaIA(PAGO), [/rpc\/consumir_uso_ia$/, 'POST', { body: 4 }], [/rpc\/devolver_uso_ia$/, 'POST', { status: 204 }]]);
  const r = await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV_IA, f, ia(new ErroIA(502, 'A IA não respondeu. Tente de novo.')));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).erro, 'A IA não respondeu. Tente de novo.');
  assert.deepEqual(f.de(/rpc\/devolver_uso_ia$/)[0].corpo, { p_usuario: UID });
});

test('IA: textos curtos, longos ou sem login são recusados antes de tudo', async () => {
  const f = fetchFalso([usuario]);
  const chamar = ia(RESPOSTA_IA);
  assert.equal((await gerarDocumentos(pedidoIA({ curriculo: 'curto', vaga: VAGA }), ENV_IA, f, chamar)).status, 400);
  assert.equal((await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: 'x' }), ENV_IA, f, chamar)).status, 400);
  assert.equal((await gerarDocumentos(pedidoIA({ curriculo: 'a'.repeat(15001), vaga: VAGA }), ENV_IA, f, chamar)).status, 413);
  assert.equal((await gerarDocumentos(pedidoIA({ curriculo: CV, vaga: VAGA }), ENV, f, chamar)).status, 503, 'sem chave da IA');
  assert.equal((await gerarDocumentos(new Request('https://x/api/gerar', { method: 'POST', body: '{}' }), ENV_IA, f, chamar)).status, 401);
  assert.equal(chamar.chamadas.length, 0);
  assert.equal(f.de(/assinaturas/).length, 0);
});

test('IA: pagante só enquanto o período pago vale', () => {
  const agora = new Date('2026-11-05T12:00:00Z');
  assert.equal(ehPagante(linha({ acesso_ate: '2026-11-06T00:00:00Z' }), agora), true);
  assert.equal(ehPagante(linha({ acesso_ate: '2026-11-04T00:00:00Z', status: 'cancelada' }), agora), false);
  assert.equal(ehPagante(linha({ teste_ate: '2026-11-10T00:00:00Z' }), agora), false, 'teste grátis');
  assert.equal(ehPagante(null, agora), false);
  assert.equal(PRECO, 19.9);
});

// ------------------------------------------------------------------ vaga por link (LinkedIn, Vagas.com, site da empresa)

const PUBLICO = async () => [{ address: '151.101.1.1', family: 4 }];
const paginaVaga = (extra = '') => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Analista Fiscal Pleno',
  description: '<p>Requisitos:</p><ul><li>Apuração de ICMS, PIS e COFINS</li><li>SPED Fiscal e EFD-Contribuições</li></ul>',
  hiringOrganization: { '@type': 'Organization', name: 'Empresa Exemplo' },
  jobLocation: [{ '@type': 'Place', address: { addressLocality: 'São Paulo', addressRegion: 'SP' } }],
})}</script>${extra}</head><body></body></html>`;

test('link: lê o JobPosting da página pública', () => {
  const v = extrairVagaDeHtml(paginaVaga());
  assert.deepEqual([v.titulo, v.empresa, v.local], ['Analista Fiscal Pleno', 'Empresa Exemplo', 'São Paulo - SP']);
  assert.match(v.texto, /- Apuração de ICMS/);
  assert.equal(extrairVagaDeHtml('<html>login</html>'), null, 'sem JobPosting: pede para colar');
  const grafo = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["JobPosting"],"title":"Vaga X","description":"${'texto da vaga '.repeat(5)}"}]}</script>`;
  assert.equal(extrairVagaDeHtml(grafo).titulo, 'Vaga X', 'acha a vaga dentro de @graph');
});

test('link: bloqueia endereço interno (o servidor não vira ponte para a rede)', async () => {
  for (const ruim of ['http://localhost/x', 'http://127.0.0.1/x', 'http://[::1]/x', 'file:///etc/passwd', 'https://user:pw@site.com/x', 'https://site.com:8080/x', 'http://intranet/x']) {
    await assert.rejects(conferirUrl(ruim, PUBLICO), (e) => e instanceof ErroLink && e.status === 400, ruim);
  }
  await assert.rejects(conferirUrl('https://rede-interna.com/x', async () => [{ address: '10.0.0.5', family: 4 }]), /não aceito/);
  await assert.rejects(conferirUrl('https://x.com/x', async () => [{ address: '169.254.169.254', family: 4 }]), /não aceito/, 'metadados da nuvem');
  assert.equal(ipPrivado('192.168.0.1'), true);
  assert.equal(ipPrivado('8.8.8.8'), false);
  assert.equal((await conferirUrl('https://www.linkedin.com/jobs/view/1', PUBLICO)).hostname, 'www.linkedin.com');
});

test('link: redirecionamento para endereço interno é bloqueado', async () => {
  const f = async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  await assert.rejects(baixarPagina('https://site.com/vaga', f, PUBLICO), /não aceito/);
});

test('link: rota completa (logado com acesso) e site que bloqueia', async () => {
  const f = fetchFalso([[/rpc\/tem_acesso$/, 'POST', { body: true }]]);
  const fx = async (url, opts) => (/site\.com/.test(url) ? new Response(paginaVaga()) : f(url, opts));
  const r = await lerLink(comToken('https://x/api/ler-link?url=' + encodeURIComponent('https://site.com/vagas/1')), ENV, fx, PUBLICO);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual([d.titulo, d.site], ['Analista Fiscal Pleno', 'site.com']);
  const bloqueia = async (url, opts) => (/linkedin/.test(url) ? new Response('authwall', { status: 999 }) : f(url, opts));
  const r2 = await lerLink(comToken('https://x/api/ler-link?url=' + encodeURIComponent('https://www.linkedin.com/jobs/view/1')), ENV, bloqueia, PUBLICO);
  assert.equal(r2.status, 422);
  assert.equal((await r2.json()).colar, true, 'app mostra "cole o texto"');
  const semLogin = await lerLink(new Request('https://x/api/ler-link?url=x'), ENV, f, PUBLICO);
  assert.equal(semLogin.status, 401);
});
