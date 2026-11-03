// Asaas: cobrança da assinatura do ImobEmpregos.
//
// Cartão: Checkout do Asaas com assinatura recorrente (a pessoa digita o cartão
//   na página do Asaas; o cartão nunca passa por este servidor).
// Pix: assinatura mensal no Asaas; cada mês gera uma cobrança Pix com link.
//
// Docs: https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
//       https://docs.asaas.com/docs/criando-uma-assinatura

export const PRECO = 10; // R$ por mês
export const DIAS_TOLERANCIA = 3; // depois do vencimento, antes de cortar o acesso

export function asaasBase(env) {
  return env.ASAAS_AMBIENTE === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

export function checkoutUrl(env, id) {
  return (env.ASAAS_AMBIENTE === 'producao' ? 'https://asaas.com' : 'https://sandbox.asaas.com')
    + '/checkoutSession/show?id=' + encodeURIComponent(id);
}

export async function asaas(env, metodo, caminho, corpo, fetchImpl = fetch) {
  if (!env.ASAAS_API_KEY) throw new Error('Servidor sem ASAAS_API_KEY.');
  const r = await fetchImpl(asaasBase(env) + caminho, {
    method: metodo,
    headers: {
      access_token: env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
      'User-Agent': 'ImobEmpregos/1.0',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

export function erroAsaas(resp) {
  const e = resp.json && resp.json.errors && resp.json.errors[0];
  return e && e.description ? e.description : 'Asaas respondeu HTTP ' + resp.status;
}

// IDs do Asaas: só letras, números, "_" e "-". Conferir antes de usar em URL ou filtro.
export const idAsaasValido = (s) => /^[A-Za-z0-9_-]{3,80}$/.test(String(s || ''));

/** Data de hoje (ou do fim do teste, se ainda não acabou), no fuso de Brasília: "AAAA-MM-DD". */
export function primeiroVencimento(testeAte, agora = new Date()) {
  const fim = new Date(testeAte);
  const quando = !isNaN(fim) && fim > agora ? fim : agora;
  return quando.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Vencimento "AAAA-MM-DD" + 1 mês + tolerância -> ISO. 31/01 vira 03/03 (fim de fevereiro + 3 dias). */
export function acessoAteParaVencimento(vencimento) {
  const m = String(vencimento || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = +m[1], mes = +m[2] - 1, dia = +m[3];
  const ultimoDiaProxMes = new Date(Date.UTC(ano, mes + 2, 0)).getUTCDate();
  const d = new Date(Date.UTC(ano, mes + 1, Math.min(dia, ultimoDiaProxMes), 23, 59, 59));
  d.setUTCDate(d.getUTCDate() + DIAS_TOLERANCIA);
  return d.toISOString();
}

const urlFaturaValida = (u) => typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)?asaas\.com\//.test(u) ? u : null;

/**
 * Evento do webhook -> o que muda na assinatura. Função pura (sem rede).
 * Devolve null para eventos ignorados, ou:
 *   { chaves: { assinatura?, cliente?, checkout? },   // como achar o usuário
 *     mudancas: { ...colunas },                       // o que gravar
 *     estenderAte?: ISO }                             // acesso_ate = o maior entre o atual e este
 */
export function processarEvento(corpo, agora = new Date()) {
  const ev = corpo && corpo.event;
  const p = corpo && corpo.payment;
  const s = corpo && corpo.subscription;
  const c = corpo && corpo.checkout;
  const forma = (b) => (b === 'PIX' || b === 'CREDIT_CARD' ? b : undefined);
  const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  if (p && /^PAYMENT_/.test(ev)) {
    const chaves = limpar({ assinatura: p.subscription, cliente: p.customer });
    switch (ev) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        return {
          chaves,
          mudancas: limpar({ status: 'ativa', forma: forma(p.billingType), asaas_assinatura_id: p.subscription, fatura_url: null }),
          estenderAte: acessoAteParaVencimento(p.dueDate),
        };
      case 'PAYMENT_CREATED':
        // Nova mensalidade Pix: guarda o link para o app mostrar "Pagar".
        return p.billingType === 'PIX' && urlFaturaValida(p.invoiceUrl)
          ? { chaves, mudancas: { fatura_url: p.invoiceUrl } }
          : null;
      case 'PAYMENT_OVERDUE':
        return { chaves, mudancas: limpar({ status: 'atrasada', fatura_url: urlFaturaValida(p.invoiceUrl) || undefined }) };
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
        // Dinheiro devolvido: o período pago deixa de valer.
        return { chaves, mudancas: { status: 'atrasada', acesso_ate: agora.toISOString() } };
      default:
        return null;
    }
  }
  if (s && /^SUBSCRIPTION_/.test(ev)) {
    const chaves = limpar({ assinatura: s.id, cliente: s.customer });
    if (ev === 'SUBSCRIPTION_CREATED') return { chaves, mudancas: limpar({ asaas_assinatura_id: s.id, forma: forma(s.billingType) }) };
    if (ev === 'SUBSCRIPTION_DELETED' || ev === 'SUBSCRIPTION_INACTIVATED') return { chaves, mudancas: { status: 'cancelada', fatura_url: null } };
    return null;
  }
  if (c && ev === 'CHECKOUT_PAID') {
    // Cartão validado e assinatura criada. O acesso continua pelo teste; a
    // primeira cobrança no cartão chega como PAYMENT_CONFIRMED.
    return { chaves: limpar({ checkout: c.id }), mudancas: { status: 'ativa', forma: 'CREDIT_CARD' } };
  }
  return null;
}

/** Filtro PostgREST para achar a assinatura pelas chaves do evento (IDs já validados). */
export function filtroDasChaves(chaves) {
  const partes = [];
  if (idAsaasValido(chaves.assinatura)) partes.push(`asaas_assinatura_id.eq.${chaves.assinatura}`);
  if (idAsaasValido(chaves.cliente)) partes.push(`asaas_cliente_id.eq.${chaves.cliente}`);
  if (idAsaasValido(chaves.checkout)) partes.push(`asaas_checkout_id.eq.${chaves.checkout}`);
  return partes.length ? `or=(${partes.join(',')})` : null;
}

/** Compara o token do webhook em tempo constante. */
export function tokenConfere(recebido, esperado) {
  const a = String(recebido || ''), b = String(esperado || '');
  if (!b || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
