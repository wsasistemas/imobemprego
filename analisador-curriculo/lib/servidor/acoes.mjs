// Ações da assinatura: assinar, cancelar e o webhook do Asaas.
// Cada uma recebe (request, env, fetchImpl) e devolve um Response, para rodar
// igual na Vercel e nos testes (com fetch falso).

import V from '../../validacao.js';
import { json, usuarioDoToken, admin, lerAssinatura, atualizarAssinatura, ehUuid } from './comum.mjs';
import {
  PRECO, asaas, erroAsaas, checkoutUrl, primeiroVencimento, processarEvento,
  filtroDasChaves, tokenConfere, idAsaasValido,
} from './asaas.mjs';

const site = (env, caminho) => String(env.SITE_URL || '').replace(/\/$/, '') + caminho;

// ------------------------------------------------------------------ assinar

/** POST /api/assinar { forma: "PIX" | "CREDIT_CARD", cpf } -> { url } para onde mandar a pessoa. */
export async function assinar(request, env, fetchImpl = fetch) {
  const { usuario, resposta } = await usuarioDoToken(request, env, fetchImpl);
  if (resposta) return resposta;
  let corpo;
  try { corpo = await request.json(); } catch { return json(400, { erro: 'Pedido inválido.' }); }
  const forma = corpo && corpo.forma;
  if (forma !== 'PIX' && forma !== 'CREDIT_CARD') return json(400, { erro: 'Escolha Pix ou cartão.' });
  const cpf = V.normalizarCpf(corpo.cpf);
  if (!cpf) return json(400, { erro: 'CPF inválido. Confira os números.' });
  if (!env.SITE_URL) return json(500, { erro: 'Servidor sem SITE_URL.' });

  try {
    const a = await lerAssinatura(env, usuario.id, fetchImpl);
    if (!a) return json(404, { erro: 'Assinatura não encontrada. Saia e entre de novo.' });

    // Já assinou com Pix e tem cobrança em aberto: só devolve o link.
    if (forma === 'PIX' && a.forma === 'PIX' && a.asaas_assinatura_id && a.status !== 'cancelada' && a.fatura_url) {
      return json(200, { url: a.fatura_url });
    }
    if (a.status === 'ativa' && a.asaas_assinatura_id) {
      return json(409, { erro: 'Você já tem uma assinatura ativa. Para trocar a forma de pagamento, cancele e assine de novo.' });
    }

    // 1. Cliente no Asaas (exige CPF). O CPF vai só para o Asaas, não fica no nosso banco.
    let cliente = a.asaas_cliente_id;
    if (!cliente) {
      const perfis = await admin(env, 'GET', `perfis?id=eq.${usuario.id}&select=nome,whatsapp`, undefined, fetchImpl);
      const p = (perfis && perfis[0]) || {};
      const r = await asaas(env, 'POST', '/customers', {
        name: p.nome || (usuario.user_metadata && usuario.user_metadata.nome) || usuario.email,
        cpfCnpj: cpf,
        email: usuario.email,
        mobilePhone: p.whatsapp ? String(p.whatsapp).replace(/^55/, '') : undefined,
        externalReference: usuario.id,
      }, fetchImpl);
      if (!r.ok || !idAsaasValido(r.json.id)) return json(502, { erro: 'Não foi possível criar seu cadastro de pagamento: ' + erroAsaas(r) });
      cliente = r.json.id;
      await atualizarAssinatura(env, usuario.id, { asaas_cliente_id: cliente }, fetchImpl);
    }

    // Quem ainda está no teste só paga quando o teste acabar.
    const vencimento = primeiroVencimento(a.teste_ate);

    // 2a. Cartão: Checkout do Asaas (a pessoa digita o cartão lá).
    if (forma === 'CREDIT_CARD') {
      const r = await asaas(env, 'POST', '/checkouts', {
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 60,
        customer: cliente,
        externalReference: usuario.id,
        callback: {
          successUrl: site(env, '/assinatura.html?r=ok'),
          cancelUrl: site(env, '/assinatura.html?r=cancelado'),
          expiredUrl: site(env, '/assinatura.html?r=expirado'),
        },
        items: [{ name: 'ImobEmpregos', description: 'Assinatura mensal, sem fidelidade', quantity: 1, value: PRECO }],
        subscription: { cycle: 'MONTHLY', nextDueDate: vencimento + ' 00:00:00' },
      }, fetchImpl);
      if (!r.ok || !idAsaasValido(r.json.id)) return json(502, { erro: 'Não foi possível abrir o pagamento: ' + erroAsaas(r) });
      await atualizarAssinatura(env, usuario.id, { asaas_checkout_id: r.json.id }, fetchImpl);
      return json(200, { url: checkoutUrl(env, r.json.id) });
    }

    // 2b. Pix: assinatura mensal; a primeira cobrança já sai com link de pagamento.
    let assinaturaId = a.forma === 'PIX' && a.status !== 'cancelada' ? a.asaas_assinatura_id : null;
    if (!assinaturaId) {
      const r = await asaas(env, 'POST', '/subscriptions', {
        customer: cliente,
        billingType: 'PIX',
        value: PRECO,
        nextDueDate: vencimento,
        cycle: 'MONTHLY',
        description: 'ImobEmpregos: assinatura mensal, sem fidelidade',
        externalReference: usuario.id,
      }, fetchImpl);
      if (!r.ok || !idAsaasValido(r.json.id)) return json(502, { erro: 'Não foi possível criar a assinatura: ' + erroAsaas(r) });
      assinaturaId = r.json.id;
      await atualizarAssinatura(env, usuario.id, { asaas_assinatura_id: assinaturaId, forma: 'PIX', status: a.status === 'cancelada' ? 'teste' : a.status }, fetchImpl);
    }
    const cobrancas = await asaas(env, 'GET', `/subscriptions/${assinaturaId}/payments?status=PENDING`, undefined, fetchImpl);
    const fatura = cobrancas.ok && cobrancas.json.data && cobrancas.json.data.find((c) => /^https:\/\/([a-z0-9-]+\.)?asaas\.com\//.test(c.invoiceUrl || ''));
    if (!fatura) return json(502, { erro: 'A assinatura foi criada, mas a cobrança Pix ainda não saiu. Tente de novo em instantes.' });
    await atualizarAssinatura(env, usuario.id, { fatura_url: fatura.invoiceUrl }, fetchImpl);
    return json(200, { url: fatura.invoiceUrl });
  } catch (e) {
    console.error('[assinar]', e); return json(500, { erro: 'Não foi possível concluir agora. Tente de novo.' });
  }
}

// ------------------------------------------------------------------ cancelar

/** POST /api/cancelar -> encerra a recorrência. O acesso vale até o fim do período pago. */
export async function cancelar(request, env, fetchImpl = fetch) {
  const { usuario, resposta } = await usuarioDoToken(request, env, fetchImpl);
  if (resposta) return resposta;
  try {
    const a = await lerAssinatura(env, usuario.id, fetchImpl);
    if (!a) return json(404, { erro: 'Assinatura não encontrada.' });
    if (a.asaas_assinatura_id) {
      if (!idAsaasValido(a.asaas_assinatura_id)) return json(500, { erro: 'Assinatura com identificador inválido.' });
      const r = await asaas(env, 'DELETE', `/subscriptions/${a.asaas_assinatura_id}`, undefined, fetchImpl);
      if (!r.ok && r.status !== 404) return json(502, { erro: 'Não foi possível cancelar agora: ' + erroAsaas(r) });
    }
    await atualizarAssinatura(env, usuario.id, { status: 'cancelada', fatura_url: null, asaas_assinatura_id: null }, fetchImpl);
    return json(200, { ok: true, acesso_ate: a.acesso_ate, teste_ate: a.teste_ate });
  } catch (e) {
    console.error('[cancelar]', e); return json(500, { erro: 'Não foi possível cancelar agora. Tente de novo.' });
  }
}

// ------------------------------------------------------------------ webhook do Asaas

/**
 * POST /api/asaas-webhook. Confere o token, aplica o evento e responde 200
 * mesmo quando o evento não se aplica (o Asaas pausa a fila se receber erros
 * seguidos). Só responde erro quando vale a pena o Asaas tentar de novo.
 */
export async function webhookAsaas(request, env, fetchImpl = fetch, agora = new Date()) {
  if (!env.ASAAS_WEBHOOK_TOKEN) return json(500, { erro: 'Servidor sem ASAAS_WEBHOOK_TOKEN.' });
  if (!tokenConfere(request.headers.get('asaas-access-token'), env.ASAAS_WEBHOOK_TOKEN)) return json(403, { erro: 'token inválido' });
  let corpo;
  try { corpo = await request.json(); } catch { return json(200, { ok: true, ignorado: 'corpo inválido' }); }
  const idEvento = String((corpo && corpo.id) || '').slice(0, 200);

  try {
    if (idEvento) {
      const ja = await admin(env, 'GET', `eventos_asaas?id=eq.${encodeURIComponent(idEvento)}&select=id`, undefined, fetchImpl);
      if (ja && ja.length) return json(200, { ok: true, repetido: true });
    }
    const efeito = processarEvento(corpo, agora);
    let aplicado = false;
    if (efeito) {
      const filtro = filtroDasChaves(efeito.chaves);
      const linhas = filtro ? await admin(env, 'GET', `assinaturas?${filtro}&select=usuario_id,acesso_ate&limit=2`, undefined, fetchImpl) : [];
      if (linhas && linhas.length === 1 && ehUuid(linhas[0].usuario_id)) {
        const mudancas = { ...efeito.mudancas };
        if (efeito.estenderAte) {
          const atual = linhas[0].acesso_ate ? new Date(linhas[0].acesso_ate) : null;
          const novo = new Date(efeito.estenderAte);
          if (!atual || novo > atual) mudancas.acesso_ate = efeito.estenderAte;
        }
        await atualizarAssinatura(env, linhas[0].usuario_id, mudancas, fetchImpl);
        aplicado = true;
      }
    }
    if (idEvento) {
      await admin(env, 'POST', 'eventos_asaas?on_conflict=id', { id: idEvento, evento: String(corpo.event || '').slice(0, 80) },
        fetchImpl, 'resolution=ignore-duplicates,return=minimal');
    }
    return json(200, { ok: true, aplicado });
  } catch (e) {
    // Falha no banco: 500 faz o Asaas reenviar depois.
    console.error('[asaas-webhook]', e); return json(500, { erro: 'falha ao gravar' });
  }
}
