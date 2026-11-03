/*
 * Validação do cadastro (nome, WhatsApp, e-mail, senha). Roda no navegador
 * (window.Validacao) e no Node (require), para os testes.
 *
 * As mesmas regras existem no banco (schema imobempregos): a tela avisa antes,
 * o banco garante.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Validacao = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Só dígitos, com 55 na frente. null se não for celular brasileiro com DDD. */
  function normalizarWhatsapp(valor) {
    let d = String(valor || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return /^55[1-9]{2}9\d{8}$/.test(d) ? d : null;
  }

  /** Máscara enquanto digita: "(11) 91234-5678". Ignora um +55 colado. */
  function mascararWhatsapp(valor) {
    let d = String(valor || '').replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function validarCadastro(c) {
    const erros = {};
    const nome = String(c.nome || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 2) erros.nome = 'Informe seu nome.';
    else if (nome.length > 120) erros.nome = 'Nome muito longo.';
    else if (!/[A-Za-zÀ-ÿ]/.test(nome)) erros.nome = 'Use letras no nome.';
    const whatsapp = normalizarWhatsapp(c.whatsapp);
    if (!whatsapp) erros.whatsapp = 'Informe um celular com DDD, como (11) 91234-5678.';
    const email = String(c.email || '').trim().toLowerCase();
    if (!validarEmail(email)) erros.email = 'Informe um e-mail válido.';
    const senha = String(c.senha || '');
    if (senha.length < 8) erros.senha = 'A senha precisa de pelo menos 8 caracteres.';
    else if (senha.length > 72) erros.senha = 'A senha pode ter no máximo 72 caracteres.';
    if (!c.termos) erros.termos = 'Para criar a conta, aceite os termos de uso e a política de privacidade.';
    return { ok: Object.keys(erros).length === 0, erros: erros, dados: { nome: nome, whatsapp: whatsapp, email: email, senha: senha } };
  }

  /** CPF com dígitos verificadores corretos -> só os 11 dígitos; senão null. */
  function normalizarCpf(valor) {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[t])) return null;
    }
    return d;
  }

  function mascararCpf(valor) {
    const d = String(valor || '').replace(/\D/g, '').slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }

  /** Erro do Supabase Auth -> mensagem em português, sem revelar se o e-mail existe no login. */
  function mensagemErroAuth(erro) {
    const codigo = erro && (erro.code || erro.error_code);
    const texto = String((erro && erro.message) || '');
    const M = {
      invalid_credentials: 'E-mail ou senha incorretos.',
      email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
      user_already_exists: 'Este e-mail já tem conta. Entre ou use "Esqueci minha senha".',
      email_exists: 'Este e-mail já tem conta. Entre ou use "Esqueci minha senha".',
      weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
      over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
      over_email_send_rate_limit: 'Muitos e-mails enviados. Espere alguns minutos e tente de novo.',
      same_password: 'A nova senha precisa ser diferente da anterior.',
      unexpected_failure: 'Não foi possível criar a conta. Confira nome e WhatsApp e tente de novo.',
    };
    if (codigo && M[codigo]) return M[codigo];
    if (/invalid login credentials/i.test(texto)) return M.invalid_credentials;
    if (/email not confirmed/i.test(texto)) return M.email_not_confirmed;
    if (/already registered/i.test(texto)) return M.user_already_exists;
    if (/database error saving new user/i.test(texto)) return M.unexpected_failure;
    if (/failed to fetch|network/i.test(texto)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Algo deu errado. Tente de novo em instantes.';
  }

  /**
   * Linha de imobempregos.assinaturas -> o que a tela mostra.
   * tipo: teste | ativa | atrasada | cancelada | bloqueado | sem
   * (A mesma regra de acesso existe no banco: imobempregos.tem_acesso().)
   */
  function situacaoAssinatura(a, agora) {
    agora = agora || new Date();
    if (!a) return { tipo: 'sem', acesso: false, texto: 'Não encontramos sua assinatura. Saia e entre de novo.' };
    const dia = 86400000;
    const fimTeste = new Date(a.teste_ate), fimPago = a.acesso_ate ? new Date(a.acesso_ate) : null;
    const emTeste = fimTeste > agora, pago = !!fimPago && fimPago > agora;
    const data = function (d) { return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); };
    const dias = emTeste ? Math.max(1, Math.ceil((fimTeste - agora) / dia)) : 0;
    const base = { acesso: emTeste || pago, diasTeste: dias, fimTeste: data(fimTeste), fimPago: fimPago ? data(fimPago) : null };
    if (a.status === 'ativa' && (pago || emTeste)) {
      return Object.assign(base, { tipo: 'ativa', texto: pago ? 'Assinatura ativa. Próxima renovação até ' + data(fimPago) + '.' : 'Assinatura feita. A primeira mensalidade vence em ' + data(fimTeste) + ', quando o teste acaba.' });
    }
    if (a.status === 'atrasada') {
      return Object.assign(base, { tipo: 'atrasada', texto: base.acesso ? 'A mensalidade venceu. Pague até ' + data(pago ? fimPago : fimTeste) + ' para não perder o acesso.' : 'A mensalidade venceu e o acesso foi pausado. Pague para voltar a usar.' });
    }
    if (a.status === 'cancelada' && base.acesso) {
      return Object.assign(base, { tipo: 'cancelada', texto: 'Assinatura cancelada. Você usa até ' + data(pago ? fimPago : fimTeste) + '.' });
    }
    if (emTeste) {
      return Object.assign(base, { tipo: 'teste', texto: dias === 1 ? 'Teste grátis: último dia.' : 'Teste grátis: faltam ' + dias + ' dias.' });
    }
    if (pago) return Object.assign(base, { tipo: 'ativa', texto: 'Acesso pago até ' + data(fimPago) + '.' });
    return Object.assign(base, { tipo: 'bloqueado', texto: a.acesso_ate ? 'Seu período pago acabou.' : 'Seu teste grátis acabou.' });
  }

  return {
    situacaoAssinatura: situacaoAssinatura,
    normalizarWhatsapp: normalizarWhatsapp, mascararWhatsapp: mascararWhatsapp,
    validarCadastro: validarCadastro, validarEmail: validarEmail, mensagemErroAuth: mensagemErroAuth,
    normalizarCpf: normalizarCpf, mascararCpf: mascararCpf,
  };
});
