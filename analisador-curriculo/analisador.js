/*
 * Analisador de Currículo — núcleo de análise (sem dependências).
 *
 * Roda no navegador (window.Analisador) e no Node (require/createRequire).
 * Tudo é determinístico: nenhuma IA, nenhum dado sai da máquina.
 *
 * Regra herdada do AI Job Search: lacuna é lacuna. O analisador mostra o que
 * falta, mas nunca sugere colocar no currículo algo que a pessoa não tem.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Analisador = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[‐-―]/g, '-')
      .replace(/ /g, ' ');
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function termoRegex(v, flags) {
    const corpo = esc(v).replace(/[ -]+/g, '[\\s-]+');
    return new RegExp('(?<![a-z0-9])' + corpo + '(?![a-z0-9])', flags || '');
  }
  function contar(texto, re) { const m = texto.match(new RegExp(re.source, 'g' + re.flags.replace('g', ''))); return m ? m.length : 0; }
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

  // ---------------------------------------------------------- dicionário
  // [nome exibido, categoria, variantes extras (já sem acento)]
  const BRUTO = [
    // Tecnologia
    ['Python', 'Tecnologia'], ['Java', 'Tecnologia'], ['JavaScript', 'Tecnologia', ['js']],
    ['TypeScript', 'Tecnologia', ['ts']], ['C#', 'Tecnologia'], ['C++', 'Tecnologia'],
    ['.NET', 'Tecnologia', ['dotnet', 'asp.net', 'net core']], ['PHP', 'Tecnologia'], ['Ruby', 'Tecnologia'],
    ['Go', 'Tecnologia', ['golang'], true], ['Kotlin', 'Tecnologia'], ['Swift', 'Tecnologia'],
    ['React', 'Tecnologia', ['react.js', 'reactjs', 'react native']], ['Angular', 'Tecnologia'],
    ['Vue', 'Tecnologia', ['vue.js', 'vuejs']], ['Node.js', 'Tecnologia', ['nodejs', 'node']],
    ['HTML', 'Tecnologia', ['html5']], ['CSS', 'Tecnologia', ['css3']], ['SQL', 'Tecnologia'],
    ['NoSQL', 'Tecnologia'], ['MySQL', 'Tecnologia'], ['PostgreSQL', 'Tecnologia', ['postgres']],
    ['Oracle', 'Tecnologia'], ['SQL Server', 'Tecnologia', ['sqlserver']], ['MongoDB', 'Tecnologia', ['mongo']],
    ['Git', 'Tecnologia'], ['GitHub', 'Tecnologia'], ['Docker', 'Tecnologia'],
    ['Kubernetes', 'Tecnologia', ['k8s']], ['AWS', 'Tecnologia', ['amazon web services']],
    ['Azure', 'Tecnologia'], ['Google Cloud', 'Tecnologia', ['gcp']], ['Linux', 'Tecnologia'],
    ['APIs REST', 'Tecnologia', ['api rest', 'apis rest', 'rest api', 'restful', 'api', 'apis']],
    ['Microsserviços', 'Tecnologia', ['microservicos', 'microservices']], ['CI/CD', 'Tecnologia'],
    ['DevOps', 'Tecnologia'], ['Terraform', 'Tecnologia'],
    ['Testes automatizados', 'Tecnologia', ['testes unitarios', 'automated tests', 'unit tests']],
    ['Selenium', 'Tecnologia'], ['Cypress', 'Tecnologia'], ['Spring', 'Tecnologia', ['spring boot']],
    ['Django', 'Tecnologia'], ['Flask', 'Tecnologia'], ['FastAPI', 'Tecnologia'], ['Flutter', 'Tecnologia'],
    ['Android', 'Tecnologia'], ['iOS', 'Tecnologia'], ['Figma', 'Tecnologia'],
    ['UX', 'Tecnologia', ['ux design', 'user experience', 'experiencia do usuario']], ['UI', 'Tecnologia', ['ui design']],
    ['ITIL', 'Tecnologia'], ['Segurança da informação', 'Tecnologia', ['cybersecurity', 'ciberseguranca', 'information security']],
    ['Redes', 'Tecnologia', ['redes de computadores', 'networking']],
    ['Suporte técnico', 'Tecnologia', ['help desk', 'helpdesk', 'service desk', 'suporte de ti']],
    ['Power Automate', 'Tecnologia'], ['RPA', 'Tecnologia'], ['Salesforce', 'Tecnologia'], ['SAP', 'Tecnologia'],
    ['TOTVS', 'Tecnologia', ['protheus']], ['ERP', 'Tecnologia'], ['CRM', 'Tecnologia'],
    ['WordPress', 'Tecnologia'], ['Shopify', 'Tecnologia'],
    // Dados
    ['Excel', 'Dados', ['microsoft excel', 'planilhas', 'planilha']], ['Excel avançado', 'Dados', ['procv', 'tabela dinamica', 'tabelas dinamicas']],
    ['Power BI', 'Dados', ['powerbi']], ['Tableau', 'Dados'], ['Looker', 'Dados', ['looker studio', 'data studio']],
    ['Estatística', 'Dados', ['statistics']], ['Machine Learning', 'Dados', ['aprendizado de maquina', 'ml']],
    ['Inteligência Artificial', 'Dados', ['ia', 'ia generativa', 'artificial intelligence', 'genai']], ['LLM', 'Dados', ['llms']],
    ['Pandas', 'Dados'], ['NumPy', 'Dados'], ['Spark', 'Dados', ['pyspark', 'apache spark']], ['ETL', 'Dados', ['elt']],
    ['Data Warehouse', 'Dados', ['dw']], ['Big Data', 'Dados'], ['Linguagem R', 'Dados', ['rstudio']],
    ['VBA', 'Dados', ['macros', 'macro']], ['Dashboards', 'Dados', ['dashboard', 'paineis']],
    ['KPIs', 'Dados', ['kpi', 'indicadores', 'indicadores de desempenho']],
    ['Análise de dados', 'Dados', ['data analysis', 'analise de informacoes']], ['Databricks', 'Dados'],
    ['Airflow', 'Dados'], ['BigQuery', 'Dados'], ['Snowflake', 'Dados'],
    // Gestão
    ['Gestão de projetos', 'Gestão', ['gerenciamento de projetos', 'project management', 'gestao de projeto']],
    ['PMP', 'Gestão'], ['PMBOK', 'Gestão'],
    ['Gestão de pessoas', 'Gestão', ['gestao de equipes', 'lideranca de equipe', 'lideranca de equipes', 'people management']],
    ['Liderança', 'Gestão', ['leadership']], ['OKR', 'Gestão', ['okrs']], ['Lean', 'Gestão', ['lean manufacturing']],
    ['Six Sigma', 'Gestão', ['seis sigma', 'green belt', 'black belt', 'yellow belt']], ['5S', 'Gestão'],
    ['Melhoria contínua', 'Gestão', ['kaizen', 'pdca']], ['Planejamento estratégico', 'Gestão', ['strategic planning']],
    ['Orçamento', 'Gestão', ['budget', 'orcamentos']], ['Scrum', 'Gestão'], ['Kanban', 'Gestão'], ['Jira', 'Gestão'],
    ['Metodologias ágeis', 'Gestão', ['agil', 'ageis', 'agile', 'metodologia agil']],
    // Negócios, finanças, administração
    ['Vendas', 'Negócios', ['venda', 'sales', 'vendedor', 'vendedora']], ['Negociação', 'Negócios', ['negotiation', 'negociar']],
    ['Prospecção', 'Negócios', ['prospectar', 'prospeccao de clientes']], ['Pós-venda', 'Negócios', ['pos venda']],
    ['Atendimento ao cliente', 'Negócios', ['atendimento ao publico', 'atendimento a clientes', 'customer service', 'sac', 'atendimento']],
    ['Customer Success', 'Negócios'], ['Telemarketing', 'Negócios', ['call center']],
    ['Contabilidade', 'Negócios', ['contabil', 'contabeis']], ['Fiscal', 'Negócios', ['area fiscal', 'obrigacoes fiscais', 'sped', 'tributario']],
    ['Departamento pessoal', 'Negócios', ['folha de pagamento', 'esocial']],
    ['Recrutamento e seleção', 'Negócios', ['recrutamento', 'r&s', 'talent acquisition']],
    ['Contas a pagar', 'Negócios'], ['Contas a receber', 'Negócios'], ['Faturamento', 'Negócios'],
    ['Conciliação bancária', 'Negócios', ['conciliacao', 'conciliacoes']], ['Fluxo de caixa', 'Negócios'],
    ['Rotinas financeiras', 'Negócios', ['financeiro', 'financas']],
    ['Compras', 'Negócios', ['suprimentos', 'procurement']],
    ['Logística', 'Negócios', ['supply chain', 'cadeia de suprimentos']], ['Controle de estoque', 'Negócios', ['estoque', 'inventario']],
    ['WMS', 'Negócios'], ['Comércio exterior', 'Negócios', ['comex', 'importacao', 'exportacao']],
    ['Auditoria', 'Negócios'], ['Compliance', 'Negócios'], ['LGPD', 'Negócios'], ['Controladoria', 'Negócios'],
    ['Análise de crédito', 'Negócios', ['credito']], ['Cobrança', 'Negócios'],
    ['Marketing digital', 'Negócios', ['digital marketing']], ['Redes sociais', 'Negócios', ['social media', 'midias sociais']],
    ['SEO', 'Negócios'], ['Google Analytics', 'Negócios', ['ga4']], ['Google Ads', 'Negócios'],
    ['Meta Ads', 'Negócios', ['facebook ads', 'instagram ads']], ['Copywriting', 'Negócios', ['copy']],
    // Ferramentas de escritório
    ['Pacote Office', 'Ferramentas', ['microsoft office', 'ms office', 'office 365', 'microsoft 365']],
    ['Word', 'Ferramentas'], ['PowerPoint', 'Ferramentas'], ['Outlook', 'Ferramentas'],
    ['Google Workspace', 'Ferramentas', ['g suite', 'google sheets', 'planilhas google']],
    ['Ferramentas digitais', 'Ferramentas', ['ferramentas tecnologicas']],
    // Idiomas
    ['Inglês', 'Idiomas', ['english']], ['Espanhol', 'Idiomas', ['spanish']], ['Francês', 'Idiomas', ['french']],
    ['Alemão', 'Idiomas', ['german']], ['Libras', 'Idiomas'],
    // Requisitos formais
    ['CNH', 'Requisitos', ['carteira de habilitacao', 'carteira nacional de habilitacao']],
    ['Ensino superior', 'Requisitos', ['graduacao', 'bacharelado', 'bacharel', 'licenciatura', 'graduado', 'graduada', 'nivel superior', 'superior completo', 'tecnologo', 'pos-graduacao', 'mba']],
    ['Ensino médio', 'Requisitos'], ['Pós-graduação', 'Requisitos', ['pos graduacao', 'mba', 'especializacao', 'mestrado']],
    ['Disponibilidade para viagens', 'Requisitos', ['disponibilidade para viajar']],
    // Comportamental (peso menor: é fácil de afirmar, difícil de provar)
    ['Comunicação', 'Comportamental', ['comunicativo', 'comunicativa', 'communication']],
    ['Trabalho em equipe', 'Comportamental', ['teamwork', 'trabalhar em equipe']],
    ['Proatividade', 'Comportamental', ['proativo', 'proativa']], ['Organização', 'Comportamental', ['organizado', 'organizada']],
    ['Resolução de problemas', 'Comportamental', ['problem solving', 'resolver problemas']],
    ['Pensamento analítico', 'Comportamental', ['perfil analitico', 'raciocinio logico', 'analytical']],
    ['Autonomia', 'Comportamental'], ['Adaptabilidade', 'Comportamental', ['flexibilidade']],
    ['Foco no cliente', 'Comportamental', ['orientacao ao cliente']], ['Relacionamento interpessoal', 'Comportamental'],
  ];

  // Variantes curtas que só valem se escritas com caixa original (ex.: "Go" a linguagem, não "go").
  const DICIONARIO = BRUTO.map(function (e) {
    const variantes = [norm(e[0])].concat((e[2] || []).map(norm));
    const unicas = Array.from(new Set(variantes));
    return {
      nome: e[0], categoria: e[1], variantes: unicas,
      exigeCaixa: !!e[3],
      regs: unicas.map(function (v) { return termoRegex(v); }),
      regOriginal: e[3] ? new RegExp('(?<![A-Za-z0-9])' + esc(e[0]) + '(?![A-Za-z0-9])') : null,
    };
  });
  const PESO_CATEGORIA = { Comportamental: 0.5 };

  // ---------------------------------------------------------- seções da vaga
  // Títulos que a Gupy cola no texto sem quebra de linha.
  const TITULOS_COLADOS = [
    'Responsabilidades e atribuições', 'Requisitos e qualificações', 'Informações adicionais',
    'Descrição da vaga', 'Etapas do processo', 'Sobre a empresa',
  ];
  const SECOES = [
    ['des', /^(diferenciais|diferencial|desejavel|desejaveis|sera um diferencial|serao diferenciais|conhecimentos desejaveis|requisitos desejaveis|nice to have|preferred|bonus|plus)/],
    ['req', /^(requisitos|qualificacoes|pre-requisitos|o que (voce|vc) precisa|o que esperamos|o que buscamos|perfil desejado|perfil do candidato|perfil da vaga|conhecimentos necessarios|conhecimentos obrigatorios|competencias tecnicas|habilidades necessarias|obrigatorio|requirements|qualifications|what you need|must have)/],
    ['resp', /^(responsabilidades|atribuicoes|atividades|principais atividades|o que (voce|vc) (vai|ira) fazer|no seu dia a dia|seu dia a dia|dia a dia|desafios|responsibilities|what you will do|sobre a vaga|descricao da vaga|descricao do cargo)/],
    ['ben', /^(beneficios|informacoes adicionais|oferecemos|o que oferecemos|benefits|etapas do processo|sobre a empresa|sobre nos|quem somos|remuneracao|local de trabalho|horario|jornada)/],
  ];
  const PESO_SECAO = { req: 3, resp: 2, geral: 2, des: 1, ben: 0 };
  const NOME_SECAO = { req: 'Requisito', resp: 'Atividade', geral: 'Citado', des: 'Desejável', ben: 'Benefícios' };

  function separarSecoesVaga(texto) {
    let t = String(texto || '').replace(/\r/g, '');
    TITULOS_COLADOS.forEach(function (tit) {
      t = t.replace(new RegExp(esc(tit), 'g'), '\n' + tit + '\n');
    });
    // Itens separados por ";" viram linhas (padrão da Gupy).
    t = t.replace(/;\s*/g, ';\n');
    const linhas = t.split('\n');
    const secoes = { geral: [], req: [], des: [], resp: [], ben: [] };
    let atual = 'geral', achouTitulo = false;
    linhas.forEach(function (linha) {
      const limpa = norm(linha).replace(/^[\s\-*•·●▪►✓✔#>\d.)]+/u, '').replace(/[:\s]+$/, '').trim();
      if (limpa && limpa.length <= 70) {
        for (let i = 0; i < SECOES.length; i++) {
          if (SECOES[i][1].test(limpa)) { atual = SECOES[i][0]; achouTitulo = true; return; }
        }
      }
      secoes[atual].push(linha);
    });
    const saida = {};
    Object.keys(secoes).forEach(function (k) { saida[k] = secoes[k].join('\n'); });
    saida.temTitulos = achouTitulo;
    return saida;
  }

  function encontraTermo(entrada, textoNorm, textoOriginal) {
    if (entrada.exigeCaixa) {
      // "Go" só conta escrito "Go" (ou "golang"); evita casar com o verbo "go".
      return entrada.regOriginal.test(textoOriginal) || entrada.regs.slice(1).some(function (r) { return r.test(textoNorm); });
    }
    return entrada.regs.some(function (r) { return r.test(textoNorm); });
  }

  // Siglas e termos técnicos fora do dicionário (ex.: "SPED", "Protheus 12", "C#").
  const SIGLAS_IGNORADAS = new Set(('PCD PCDS CLT PJ VR VA VT RH BH SP RJ MG RS PR SC BA PE CE GO DF ES MT MS PA AM AC AP RO RR TO MA PI RN PB AL SE ' +
    'EAD CEP CPF RG CNPJ OU DE DA DO EM ATE OK LTDA SA S/A EU ME UF PLR CV HR TI IT CEO CTO CFO AI IA PS OBS LGBT LGBTQ LGBTQIA ESG CBO INSS FGTS PAT').split(' '));
  function termosExtras(texto) {
    const achados = new Map();
    const re = /(?<![A-Za-z0-9])([A-Z][A-Z0-9&]{1,7}|[A-Za-z]+(?:\.js|\.NET|#|\+\+))(?![A-Za-z0-9])/g;
    let m;
    while ((m = re.exec(texto))) {
      const t = m[1];
      if (SIGLAS_IGNORADAS.has(t) || /^\d+$/.test(t)) continue;
      const n = norm(t);
      if (DICIONARIO.some(function (d) { return d.variantes.indexOf(n) >= 0; })) continue;
      achados.set(n, t);
    }
    return Array.from(achados.values());
  }

  // ---------------------------------------------------------- idiomas
  const IDIOMAS = { 'Inglês': ['ingles', 'english'], 'Espanhol': ['espanhol', 'spanish'], 'Francês': ['frances', 'french'], 'Alemão': ['alemao', 'german'] };
  const NIVEIS = [
    [/\b(nativo|nativa|native|lingua materna)\b/, 5, 'nativo'],
    [/\b(fluente|fluencia|fluent|fluency|c2)\b/, 4, 'fluente'],
    [/\b(avancado|avancada|advanced|c1)\b/, 3, 'avançado'],
    [/\b(intermediario|intermediaria|intermediate|conversacao|b1|b2)\b/, 2, 'intermediário'],
    [/\b(basico|basica|basic|a1|a2|tecnico|leitura)\b/, 1, 'básico'],
  ];
  function niveisIdioma(texto) {
    const res = {};
    const frases = norm(texto).split(/[\n.;|]/);
    Object.keys(IDIOMAS).forEach(function (idioma) {
      const regs = IDIOMAS[idioma].map(function (v) { return termoRegex(v); });
      frases.forEach(function (f) {
        if (!regs.some(function (r) { return r.test(f); })) return;
        let nivel = 0, rotulo = 'nível não informado';
        NIVEIS.forEach(function (n) { if (nivel < n[1] && n[0].test(f)) { nivel = n[1]; rotulo = n[2]; } });
        if (!res[idioma] || res[idioma].nivel < nivel) res[idioma] = { nivel: nivel, rotulo: rotulo };
      });
    });
    return res;
  }

  // ---------------------------------------------------------- análise da vaga
  function analisarVaga(vagaTexto) {
    const secoes = separarSecoesVaga(vagaTexto);
    const ordem = ['req', 'resp', 'geral', 'des'];
    const palavras = [];
    DICIONARIO.forEach(function (d) {
      for (let i = 0; i < ordem.length; i++) {
        const s = ordem[i];
        const txt = secoes[s];
        if (txt && encontraTermo(d, norm(txt), txt)) {
          palavras.push({ termo: d.nome, categoria: d.categoria, secao: s, entrada: d });
          return;
        }
      }
    });
    // Siglas fora do dicionário, só das partes que importam.
    const relevante = [secoes.req, secoes.resp, secoes.geral, secoes.des].join('\n');
    termosExtras(relevante).filter(function (t) {
      // "BI" de "Power BI" já está coberto pelo termo do dicionário.
      const r = termoRegex(norm(t));
      return !palavras.some(function (p) { return p.entrada.variantes.some(function (v) { return r.test(v); }); });
    }).forEach(function (t) {
      const s = ordem.find(function (k) { return secoes[k] && termoRegex(norm(t)).test(norm(secoes[k])); }) || 'geral';
      palavras.push({ termo: t, categoria: 'Outros termos da vaga', secao: s, entrada: null });
    });

    const semBeneficios = [secoes.geral, secoes.req, secoes.resp, secoes.des].join('\n');
    const n = norm(semBeneficios);
    const trechos = function (re, max) {
      const out = [];
      semBeneficios.split(/\n|(?<=\.)\s/).forEach(function (l) { if (out.length < (max || 2) && re.test(norm(l)) && l.trim().length < 220) out.push(l.trim()); });
      return out;
    };
    const anos = n.match(/(\d{1,2})\s*(\+|ou mais)?\s*anos?\s+de\s+experiencia/);
    return {
      secoes: secoes,
      palavras: palavras,
      idiomas: niveisIdioma(semBeneficios),
      anosExperiencia: anos ? Number(anos[1]) : null,
      escolaridade: trechos(/(ensino superior|superior completo|graduacao|graduado|bacharel|ensino medio|tecnico em|pos-graduacao|mba|formacao em|cursando)/),
      modalidade: /\b(100% remoto|remoto|remote|home office)\b/.test(n) ? 'Remoto' : /\b(hibrido|hybrid)\b/.test(n) ? 'Híbrido' : /\bpresencial|on-site\b/.test(n) ? 'Presencial' : null,
      contrato: /\bclt\b/.test(n) ? 'CLT' : /\bpj\b|pessoa juridica/.test(n) ? 'PJ' : /\bestagio\b/.test(n) ? 'Estágio' : null,
      integridade: verificarIntegridade(vagaTexto),
    };
  }

  // ---------------------------------------------------------- integridade da vaga
  // Versão enxuta do tools/posting_guard.py do projeto: a vaga é texto de terceiros.
  const INVISIVEIS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;
  const LINHAS_SUSPEITAS = [
    /(ignore|ignorar|desconsidere|esqueca)\b.{0,40}\b(instruc|prompt|anterior|previous|above|acima)/,
    /\b(you are|voce e)\s+(an?\s+|um\s+|uma\s+)?(ai|ia|assistente|assistant|modelo de linguagem|language model|chatgpt|claude|gpt)\b/,
    /\b(if you are|se voce (for|e))\s+(an?\s+|um\s+|uma\s+)?(ai|ia|llm|bot|assistente|modelo)/,
    /\b(system prompt|prompt do sistema|developer message)\b/,
    /\b(as an ai|como uma? ia)\b/,
  ];
  function verificarIntegridade(texto) {
    const t = String(texto || '');
    const invisiveis = (t.match(INVISIVEIS) || []).length;
    const suspeitas = [];
    t.split('\n').forEach(function (l) {
      const n = norm(l);
      if (LINHAS_SUSPEITAS.some(function (r) { return r.test(n); })) suspeitas.push(l.trim().slice(0, 200));
    });
    const misturadas = (t.match(/[A-Za-z]*[Ѐ-ӿͰ-Ͽ]+[A-Za-z]+|[A-Za-z]+[Ѐ-ӿͰ-Ͽ]+/g) || []).slice(0, 5);
    const alerta = suspeitas.length > 0 || misturadas.length > 0 || /[‪-‮⁦-⁩]/.test(t);
    return { invisiveis: invisiveis, suspeitas: suspeitas, misturadas: misturadas, alerta: alerta };
  }

  // ---------------------------------------------------------- análise do currículo
  const TITULOS_CV = {
    resumo: /^(resumo|resumo profissional|perfil|perfil profissional|objetivo|objetivo profissional|sobre mim|apresentacao|summary|profile|about me|objective)\b/,
    experiencia: /^(experiencia|experiencias|experiencia profissional|historico profissional|trajetoria profissional|experience|work experience|professional experience|employment)\b/,
    formacao: /^(formacao|formacao academica|educacao|escolaridade|education|academic background)\b/,
    habilidades: /^(habilidades|competencias|conhecimentos|conhecimentos tecnicos|skills|hard skills|competencias tecnicas|ferramentas|tecnologias)\b/,
    idiomas: /^(idiomas|linguas|languages)\b/,
    cursos: /^(cursos|certificacoes|certificados|cursos complementares|qualificacoes|certifications|courses|formacao complementar)\b/,
  };
  const NOME_TITULO_CV = { resumo: 'Resumo / objetivo', experiencia: 'Experiência profissional', formacao: 'Formação', habilidades: 'Habilidades / competências', idiomas: 'Idiomas', cursos: 'Cursos e certificações' };

  const VERBOS_ACAO = ('desenvolvi implementei implantei liderei gerenciei coordenei criei reduzi aumentei otimizei automatizei estruturei ' +
    'conduzi analisei entreguei negociei treinei melhorei elaborei construi lancei projetei padronizei mapeei economizei conquistei ' +
    'supervisionei migrei integrei organizei atingi superei expandi modernizei reestruturei acelerei capacitei resolvi ' +
    'developed led managed built created reduced increased improved implemented designed launched automated delivered').split(' ');
  const FRASES_FRACAS = ['responsavel por', 'responsavel pela', 'responsavel pelo', 'auxiliei', 'ajudei', 'participei', 'tarefas como', 'atividades como', 'auxilio em', 'auxiliar nas'];
  const CLICHES = ['proativo', 'proativa', 'dinamico', 'dinamica', 'focado em resultados', 'focada em resultados', 'team player', 'facilidade de aprendizado', 'perfeccionista', 'motivado', 'motivada', 'comprometido', 'comprometida'];

  function analisarCurriculo(cvTexto, pdfMeta) {
    const original = String(cvTexto || '');
    const n = norm(original);
    const palavras = (n.match(/[a-z0-9]+/g) || []).length;
    const linhas = original.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

    // Seções
    const secoes = {};
    Object.keys(TITULOS_CV).forEach(function (k) { secoes[k] = false; });
    linhas.forEach(function (l) {
      const ln = norm(l).replace(/^[\s\-*•·●#>|]+/u, '').replace(/[:\s|]+$/, '').trim();
      if (ln.length > 45) return;
      Object.keys(TITULOS_CV).forEach(function (k) { if (TITULOS_CV[k].test(ln)) secoes[k] = true; });
    });
    // Texto espaçado ("E X P E R I Ê N C I A") só aparece aqui se o PDF foi montado assim.
    const espacado = /(?:^|\n)\s*(?:[A-ZÀ-Ú] ){4,}[A-ZÀ-Ú]/.test(original);

    // Contato
    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(original);
    const telefone = /(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\s?\d{4}[\s.-]?\d{4}\b/.test(original);
    const linkedin = /linkedin\.com\/in\//i.test(original);
    const local = /\b[A-ZÀ-Úa-zà-ú. ]{3,}\s*[-–\/,]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/.test(original) || /\b(sao paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|salvador|recife|fortaleza|brasilia|remoto)\b/.test(n);

    // Problemas de leitura por ATS
    const lixo = (original.match(/\(cid:\d+\)|�|[-]/g) || []).length;

    // Dados pessoais dispensáveis
    const sensiveis = [];
    if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(original) || /\bcpf\b/.test(n)) sensiveis.push('CPF');
    if (/\brg\b\s*[:nº]/.test(n) || /\bidentidade\b/.test(n)) sensiveis.push('RG');
    if (/\bestado civil\b|\b(casado|casada|solteiro|solteira|divorciado|divorciada|viuvo|viuva)\b/.test(n)) sensiveis.push('estado civil');
    if (/data de nascimento|nascid[oa] em|\banos de idade\b|\bidade\s*:/.test(n)) sensiveis.push('idade / data de nascimento');
    if (/\b(filhos|filho|filha)\b\s*[:]?\s*\d|\bpossuo filhos\b|\bsem filhos\b/.test(n)) sensiveis.push('filhos');
    if (/\breligiao\b/.test(n)) sensiveis.push('religião');

    // Qualidade do texto
    const verbos = VERBOS_ACAO.filter(function (v) { return termoRegex(v).test(n); });
    const fracas = FRASES_FRACAS.reduce(function (s, f) { return s + contar(n, termoRegex(f)); }, 0);
    const cliches = CLICHES.filter(function (c) { return termoRegex(c).test(n); });
    const reNumero = /(\d+[.,]?\d*\s?%|r\$\s?\d|\bus\$\s?\d|\b\d+[.,]?\d*\s?(mil|milhoes|milhao|k|mi)\b|\b\d+\s+(clientes|pessoas|projetos|lojas|vendas|usuarios|colaboradores|funcionarios|chamados|pedidos|contratos|unidades|horas|dias|meses|empresas|alunos)\b)/;
    const quantificadas = linhas.filter(function (l) { return reNumero.test(norm(l)); }).length;
    const primeiraPessoa = contar(n, /(?<![a-z])eu(?![a-z])/);
    const linhasLongas = linhas.filter(function (l) { return l.length > 260; }).length;

    return {
      palavras: palavras, linhas: linhas.length, paginas: pdfMeta && pdfMeta.paginas || null,
      colunas: pdfMeta && pdfMeta.taxaColunas != null ? pdfMeta.taxaColunas : null,
      secoes: secoes, espacado: espacado,
      contato: { email: email, telefone: telefone, linkedin: linkedin, local: local },
      lixo: lixo, sensiveis: sensiveis,
      verbos: verbos, fracas: fracas, cliches: cliches, quantificadas: quantificadas,
      primeiraPessoa: primeiraPessoa, linhasLongas: linhasLongas,
      idiomas: niveisIdioma(original),
    };
  }

  // ---------------------------------------------------------- notas
  function notaAts(cv) {
    if (cv.palavras < 60) return 5;
    let p = 30;
    p += cv.contato.email ? 10 : 0; p += cv.contato.telefone ? 10 : 0;
    p += cv.contato.linkedin ? 5 : 0; p += cv.contato.local ? 5 : 0;
    p += cv.secoes.experiencia ? 12 : 0; p += cv.secoes.formacao ? 10 : 0;
    p += cv.secoes.habilidades ? 8 : 0; p += cv.secoes.resumo ? 6 : 0; p += cv.secoes.idiomas ? 4 : 0;
    if (cv.lixo > 0) p -= Math.min(30, 10 + cv.lixo);
    if (cv.espacado) p -= 10;
    if (cv.colunas != null && cv.colunas > 0.3) p -= 15;
    return clamp(p);
  }
  function notaQualidade(cv) {
    if (cv.palavras < 60) return 0;
    let p = 0;
    p += Math.min(25, cv.quantificadas * 5);
    p += Math.min(20, cv.verbos.length * 2.5);
    p += Math.max(0, 15 - cv.fracas * 3);
    const tamOk = cv.paginas ? (cv.paginas <= 2 ? 15 : cv.paginas === 3 ? 8 : 0) : (cv.palavras >= 250 && cv.palavras <= 1100 ? 15 : cv.palavras <= 1500 ? 8 : 3);
    p += tamOk;
    p += cv.sensiveis.length === 0 ? 15 : Math.max(0, 15 - cv.sensiveis.length * 5);
    p += Math.max(0, 10 - cv.cliches.length * 2 - Math.min(4, cv.primeiraPessoa));
    return clamp(p);
  }

  // ---------------------------------------------------------- cruzamento
  function cruzar(vaga, cvTexto) {
    const n = norm(cvTexto), original = String(cvTexto || '');
    let total = 0, obtido = 0;
    const itens = vaga.palavras.map(function (p) {
      const tem = p.entrada ? encontraTermo(p.entrada, n, original) : termoRegex(norm(p.termo)).test(n);
      const peso = PESO_SECAO[p.secao] * (PESO_CATEGORIA[p.categoria] || 1);
      total += peso; if (tem) obtido += peso;
      return { termo: p.termo, categoria: p.categoria, secao: p.secao, secaoNome: NOME_SECAO[p.secao], encontrado: tem, peso: peso };
    });
    itens.sort(function (a, b) { return (b.peso - a.peso) || a.termo.localeCompare(b.termo); });
    return { itens: itens, nota: total ? clamp((obtido / total) * 100) : null };
  }

  function compararIdiomas(vaga, cv) {
    const alertas = [];
    Object.keys(vaga.idiomas).forEach(function (idioma) {
      const pede = vaga.idiomas[idioma], tem = cv.idiomas[idioma];
      if (!tem) alertas.push({ nivel: 'alta', texto: 'A vaga pede ' + idioma + (pede.nivel ? ' (' + pede.rotulo + ')' : '') + ', e o currículo não menciona esse idioma. Se você fala, inclua com o nível real; se não fala, é uma lacuna que pesa.' });
      else if (pede.nivel && tem.nivel && tem.nivel < pede.nivel) alertas.push({ nivel: 'media', texto: idioma + ': a vaga pede ' + pede.rotulo + ' e o currículo diz ' + tem.rotulo + '. Não aumente o nível no papel; decida se vale arriscar.' });
      else if (pede.nivel && !tem.nivel) alertas.push({ nivel: 'baixa', texto: idioma + ' aparece no currículo sem nível. A vaga pede ' + pede.rotulo + '; informe seu nível real.' });
    });
    return alertas;
  }

  // ---------------------------------------------------------- sugestões
  function sugestoes(cv, cruz, vaga) {
    const s = [];
    const add = function (nivel, texto) { s.push({ nivel: nivel, texto: texto }); };
    if (cv.palavras < 60) add('alta', 'Quase nenhum texto foi lido. Se o currículo é PDF, ele pode ser uma imagem (escaneado ou exportado como figura): um ATS não lê nada disso. Exporte de novo a partir do Word/Google Docs.');
    if (cv.lixo > 0) add('alta', 'Há ' + cv.lixo + ' caractere(s) ilegível(is) no texto extraído (ícones ou fontes sem mapeamento). Troque ícones por texto ("E-mail:", "Telefone:").');
    if (cv.colunas != null && cv.colunas > 0.3) add('alta', 'O PDF parece ter duas colunas lado a lado. Muitos ATS leem colunas fora de ordem; prefira uma coluna só.');
    if (cv.espacado) add('media', 'Títulos com letras espaçadas ("E X P E R I Ê N C I A") viram letras soltas para o ATS. Use texto normal.');
    if (!cv.contato.email) add('alta', 'Nenhum e-mail encontrado como texto. Escreva o e-mail por extenso (não só como ícone ou link).');
    if (!cv.contato.telefone) add('alta', 'Nenhum telefone encontrado. Inclua com DDD, por exemplo (11) 91234-5678.');
    if (!cv.contato.linkedin) add('baixa', 'Sem link do LinkedIn (linkedin.com/in/...). Recrutadores no Brasil costumam conferir.');
    if (!cv.contato.local) add('baixa', 'Cidade/UF não identificadas. Informe "Cidade - UF"; muitas vagas filtram por região.');
    Object.keys(cv.secoes).forEach(function (k) {
      if (!cv.secoes[k] && (k === 'experiencia' || k === 'formacao')) add('alta', 'Seção "' + NOME_TITULO_CV[k] + '" não encontrada com um título padrão. Use títulos simples que o ATS reconhece.');
      else if (!cv.secoes[k] && (k === 'habilidades' || k === 'resumo')) add('media', 'Falta uma seção "' + NOME_TITULO_CV[k] + '" com título padrão.');
    });
    if (cv.sensiveis.length) add('media', 'Dados pessoais dispensáveis: ' + cv.sensiveis.join(', ') + '. Não são exigidos no currículo e expõem você (LGPD) e a vieses na triagem. Remova.');
    if (cv.quantificadas < 3) add('media', 'Poucos resultados com números (' + cv.quantificadas + '). Onde for verdade, diga quanto: "%", "R$", nº de clientes, prazos.');
    if (cv.verbos.length < 5) add('media', 'Poucos verbos de ação ("implantei", "reduzi", "coordenei"). Comece as linhas de experiência pelo que você fez.');
    if (cv.fracas > 2) add('baixa', '"Responsável por" / "auxiliei" aparecem ' + cv.fracas + ' vezes. Troque pelo resultado: o que mudou porque você estava lá.');
    if (cv.cliches.length) add('baixa', 'Adjetivos que todo currículo usa: ' + cv.cliches.join(', ') + '. Prove com um fato em vez de afirmar.');
    if (cv.primeiraPessoa > 2) add('baixa', 'O pronome "eu" aparece ' + cv.primeiraPessoa + ' vezes. Em currículo, comece direto pelo verbo.');
    if (cv.paginas && cv.paginas > 2) add('media', 'O PDF tem ' + cv.paginas + ' páginas. Para a maioria das vagas, 1 a 2 páginas bastam.');
    else if (!cv.paginas && cv.palavras > 1300) add('media', 'O texto tem ' + cv.palavras + ' palavras, provavelmente mais de 2 páginas.');
    if (cv.linhasLongas > 2) add('baixa', cv.linhasLongas + ' parágrafos muito longos. Quebre em itens curtos de uma ou duas linhas.');
    if (cruz && cruz.itens.length) {
      const faltaReq = cruz.itens.filter(function (i) { return !i.encontrado && i.secao === 'req'; });
      if (faltaReq.length) add('alta', 'Requisitos da vaga que não aparecem no currículo: ' + faltaReq.slice(0, 8).map(function (i) { return i.termo; }).join(', ') + '. Se você tem, escreva com o mesmo termo da vaga e mostre onde usou. Se não tem, deixe como está: nunca invente.');
      const faltaDes = cruz.itens.filter(function (i) { return !i.encontrado && i.secao === 'des'; });
      if (faltaDes.length) add('baixa', 'Diferenciais que não aparecem: ' + faltaDes.slice(0, 6).map(function (i) { return i.termo; }).join(', ') + '. Só vale citar o que é verdade.');
    }
    if (vaga && vaga.integridade.alerta) add('alta', 'A vaga tem trechos com cara de instrução para IA ou caracteres disfarçados. Leia a vaga original antes de usar qualquer automação nela.');
    const ordem = { alta: 0, media: 1, baixa: 2 };
    return s.sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel]; });
  }

  // ---------------------------------------------------------- API pública
  function analisar(opcoes) {
    const cvTexto = opcoes.cvTexto || '', vagaTexto = opcoes.vagaTexto || '';
    const cv = analisarCurriculo(cvTexto, opcoes.pdfMeta);
    const vaga = vagaTexto.trim() ? analisarVaga(vagaTexto) : null;
    const cruz = vaga ? cruzar(vaga, cvTexto) : null;
    const alertasVaga = vaga ? compararIdiomas(vaga, cv) : [];
    return {
      cv: cv, vaga: vaga, cruzamento: cruz,
      notas: { aderencia: cruz ? cruz.nota : null, ats: notaAts(cv), qualidade: notaQualidade(cv) },
      alertasVaga: alertasVaga,
      sugestoes: sugestoes(cv, cruz, vaga),
      nomesSecoes: NOME_TITULO_CV,
    };
  }

  /** Nota rápida de aderência, usada para ranquear uma lista de vagas. */
  function aderencia(cvTexto, vagaTexto) {
    const c = cruzar(analisarVaga(vagaTexto), cvTexto);
    return { nota: c.nota, faltam: c.itens.filter(function (i) { return !i.encontrado && i.secao === 'req'; }).map(function (i) { return i.termo; }) };
  }

  function linksBusca(termo, local) {
    const t = String(termo || '').trim();
    const q = encodeURIComponent(t), l = encodeURIComponent(local || 'Brasil');
    const slug = norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [
      { site: 'Gupy', url: 'https://portal.gupy.io/job-search/term=' + q },
      { site: 'LinkedIn', url: 'https://www.linkedin.com/jobs/search/?keywords=' + q + '&location=' + l },
      { site: 'Indeed', url: 'https://br.indeed.com/jobs?q=' + q + '&l=' + encodeURIComponent(local || '') },
      { site: 'Catho', url: 'https://www.catho.com.br/vagas/' + slug + '/' },
      { site: 'InfoJobs', url: 'https://www.infojobs.com.br/empregos.aspx?palabra=' + q },
      { site: 'Vagas.com', url: 'https://www.vagas.com.br/vagas-de-' + slug },
    ];
  }

  function relatorioMarkdown(r, titulo) {
    const L = [];
    const nota = function (v) { return v == null ? '—' : v + '/100'; };
    L.push('# Análise de currículo' + (titulo ? ' — ' + titulo : ''));
    L.push('');
    L.push('Gerado em ' + new Date().toLocaleString('pt-BR') + ' pelo Analisador de Currículo (análise local, sem IA).');
    L.push('');
    L.push('| Indicador | Nota |'); L.push('|---|---|');
    L.push('| Aderência à vaga | ' + nota(r.notas.aderencia) + ' |');
    L.push('| Leitura por ATS | ' + nota(r.notas.ats) + ' |');
    L.push('| Qualidade do texto | ' + nota(r.notas.qualidade) + ' |');
    L.push('');
    if (r.cruzamento && r.cruzamento.itens.length) {
      L.push('## Palavras-chave da vaga'); L.push('');
      L.push('| Termo | Onde aparece na vaga | No currículo? |'); L.push('|---|---|---|');
      r.cruzamento.itens.forEach(function (i) { L.push('| ' + i.termo + ' | ' + i.secaoNome + ' | ' + (i.encontrado ? 'sim' : '**não**') + ' |'); });
      L.push('');
      L.push('> Termo ausente é lacuna. Inclua só o que você realmente tem.'); L.push('');
    }
    if (r.alertasVaga.length) { L.push('## Alertas da vaga'); L.push(''); r.alertasVaga.forEach(function (a) { L.push('- ' + a.texto); }); L.push(''); }
    L.push('## Sugestões'); L.push('');
    if (!r.sugestoes.length) L.push('- Nenhum problema encontrado pelas regras automáticas.');
    r.sugestoes.forEach(function (s) { L.push('- [' + ({ alta: 'Alta', media: 'Média', baixa: 'Baixa' })[s.nivel] + '] ' + s.texto); });
    L.push('');
    return L.join('\n');
  }

  return {
    analisar: analisar, analisarVaga: analisarVaga, analisarCurriculo: analisarCurriculo,
    aderencia: aderencia, linksBusca: linksBusca, relatorioMarkdown: relatorioMarkdown,
    separarSecoesVaga: separarSecoesVaga, verificarIntegridade: verificarIntegridade, norm: norm,
    _dicionario: DICIONARIO,
  };
});
