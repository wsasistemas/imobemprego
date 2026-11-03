# Plano: "Próximos passos" com IA (só para quem paga)

Aprovado em 03/11/2026. Mockup: https://claude.ai/artifact/D3suMmegAVqSeRGNhBhnGV

## Regras fechadas

- Preço: **R$ 19,90 por mês**, sem fidelidade, 10 dias grátis sem cartão.
- IA: **Claude Sonnet 5.5**, até **25 gerações por mês** por assinante. Cada geração produz o currículo adaptado e a carta. O mês renova no dia 1 (horário de Brasília).
- "Pagante" = já pagou e o período pago está valendo (`acesso_ate` no futuro). Teste grátis não usa a IA do app.
- No teste grátis a seção aparece com cadeado e um botão "Gerar no Gemini (grátis)", que copia o pedido pronto e abre o Gemini. Custo zero.
- Análise do currículo e busca de vagas continuam liberadas no teste e para pagantes, sem limite (não usam IA).
- O currículo vai à IA só na hora de gerar e não fica guardado no servidor. O resultado fica no aparelho.
- Meta: lucro de pelo menos 50% de cada mensalidade (conta na seção Custos, abaixo).

## Custos (por assinante, por mês, pior caso)

R$ 19,90 − Asaas Pix R$ 1,99 − imposto ~6% R$ 1,19 − lucro 50% R$ 9,95 = **R$ 6,77 para IA**.
Uma geração no Sonnet 5.5 (~5 mil tokens de entrada, ~3 mil de saída, dólar a R$ 6) ≈ R$ 0,24. Cabem 28; o limite de 25 deixa folga.

## Fases

### Fase 1: banco (migração aditiva)
- [x] Tabela `uso_ia` (usuário, mês, usos) com RLS: cada um lê só o seu
- [x] `consumir_uso_ia(usuario, limite)` atômica, só para o servidor
- [x] `devolver_uso_ia(usuario)` para quando a IA falha
- [x] `marcar_candidatura(...)` só para pagantes; cria a vaga no cache se faltar
- [x] Testes no PGlite

### Fase 2: servidor
- [x] `PRECO = 19.90` e textos de preço
- [x] `POST /api/gerar`: login, pagante, limite, chama a IA, devolve currículo, carta e o que mudou
- [x] Devolve o uso quando a IA falha; recusa texto grande demais
- [x] Dependência `@anthropic-ai/sdk` na raiz e instalação na Vercel
- [x] Testes com IA e Supabase simulados

### Fase 3: app
- [x] Seção "Próximos passos" com cadeado no teste e botão do Gemini
- [x] Para pagantes: "Adaptar meu currículo", contador "IA: X de 25", "Marcar como candidatura"
- [x] Tela do resultado: abas Currículo e Carta, trechos reescritos destacados, copiar e baixar PDF
- [x] "Minhas candidaturas": resumo, lista e mudar status
- [x] Consentimento no primeiro uso da IA

### Fase 3b: fluxo em 5 passos e vaga por link (aprovado em 03/11/2026)
- [x] Tela em 5 passos com barra de progresso e Voltar/Próximo fixos embaixo
- [x] Currículo guardado só no aparelho; volta direto para a escolha da vaga
- [x] Aba "LinkedIn e outros": links de busca, colar link, ler vaga pelo link, colar texto
- [x] `GET /api/ler-link` lê a página pública (JobPosting), com bloqueio de endereço interno
- [x] Compartilhar › ImobEmpregos (Android, app instalado)
- [x] Candidaturas aceitam vaga de qualquer site (link https)

### Fase 4: textos e publicação
- [x] Preço em assinatura, termos e PUBLICAR.md
- [x] Política de privacidade: currículo enviado à IA (Anthropic) só para gerar
- [ ] `ANTHROPIC_API_KEY` na Vercel (você)
- [ ] Migração nova aplicada no Supabase (você)
