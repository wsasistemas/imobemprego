# Publicar o ImobEmpregos na internet

## Como o app funciona

- **Acesso só com login** (e-mail e senha). O cadastro pede nome, WhatsApp, e-mail e senha.
- **10 dias grátis, sem cartão.** Depois, **R$ 19,90 por mês**, por Pix ou cartão, **sem fidelidade**: a pessoa cancela no app e usa até o fim do período pago.
- **Só para quem já pagou:** a IA (Claude Sonnet 5.5) adapta o currículo e escreve a carta para a vaga, **até 25 vezes por mês**, e a lista "Minhas candidaturas". No teste grátis essa parte aparece com cadeado e um botão "Gerar grátis no Gemini" (copia o pedido e abre o Gemini; custo zero). Conta de custo e lucro: [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md).
- **App em 5 passos** (Currículo › Vaga › Análise › Carta › Enviar), com Voltar/Próximo. O currículo fica guardado só no aparelho. A vaga vem da busca na Gupy, de um **link** (LinkedIn, Vagas.com, site da empresa: o servidor lê só a página pública, nunca com login de outro site; testado em 03/11/2026: LinkedIn e Vagas.com leem, Indeed bloqueia e o app pede para colar o texto) ou do texto colado. No Android, com o app instalado, a vaga pode vir pelo **Compartilhar › ImobEmpregos**.
- Páginas: `entrar.html` (entrar, criar conta, senhas), `index.html` (o app), `assinatura.html` (plano, pagar, cancelar), `termos.html`, `privacidade.html`.
- **Instalável no celular** (Android: Chrome > "Instalar app"; iPhone: Safari > Compartilhar > "Adicionar à Tela de Início").
- O **currículo só sai do aparelho quando um assinante pede para a IA adaptar**: vai à IA e volta, sem ficar guardado no servidor. O resultado fica salvo só no aparelho. O **CPF** vai só para o Asaas, no momento de assinar; não fica no nosso banco.

| Peça | Serviço | Custo para começar |
|---|---|---|
| Site e funções | Vercel (plano Pro, já contratado) | Incluído no Pro (uso comercial permitido) |
| Contas e banco | Supabase | Grátis até 50 mil usuários/mês (pausa após 7 dias sem uso: o próprio uso diário evita) |
| Cobrança | Asaas | Sem mensalidade; taxa por cobrança paga (Pix cerca de R$ 1,99; confira a tabela atual) |
| IA | Anthropic (Claude Sonnet 5.5) | Por uso: cerca de R$ 0,24 por currículo e carta; no máximo 25 por assinante por mês |
| Domínio `.com.br` | Registro.br | Opcional, cerca de R$ 40 por ano. `imobemprego.vercel.app` já funciona |

### Como a cobrança funciona

- **Cartão:** a pessoa digita o cartão na página do Asaas (Checkout recorrente). O cartão nunca passa pelo nosso servidor, e a renovação é automática.
- **Pix:** o Asaas cria uma assinatura mensal com uma cobrança Pix por mês. O app mostra o botão "Pagar o Pix", e o Asaas também avisa a pessoa por e-mail.
- Quem assina durante o teste só paga a primeira mensalidade quando o teste acaba.
- O Asaas avisa o app de cada pagamento (webhook em `/api/asaas-webhook`). Pagamento confirmado libera o acesso até o vencimento + 1 mês + 3 dias de tolerância. Estorno corta o acesso; cancelamento mantém até o fim do período pago.
- A regra de acesso fica no banco (`imobempregos.tem_acesso()`). A busca de vagas confere essa regra no servidor a cada pedido.

## 1. Supabase (projeto compartilhado `ikvjaowvpvxojvcfwnct`)

O ImobEmpregos usa o mesmo projeto Supabase dos outros apps Imob (imobdoces, imobrh, imobinsta…), com o schema próprio `imobempregos`. O **login é compartilhado**: quem já tem conta em outro app entra com a mesma senha e só completa nome e WhatsApp (tela "Complete seu cadastro"; um teste grátis por conta).

Cuidados, porque estas configurações valem para **todos** os apps do projeto:
- O gatilho de cadastro só age em cadastros feitos pelo ImobEmpregos (marca `app: imobempregos`). Os cadastros dos outros apps não mudam; há teste automático para isso.
- **Não troque a *Site URL*** nem a senha mínima do projeto. O ImobEmpregos manda o endereço de volta em cada e-mail, e o próprio app exige 8 caracteres na senha.
- **Modelos de e-mail** (confirmação e nova senha) são os mesmos para todos os apps. Se for editar, use um texto neutro, que sirva para qualquer app Imob.

Passos:
1. Aplique as migrações de `supabase/migrations/`, **em ordem**:
   - **Pelo painel:** SQL Editor > cole `20261103100327_schema_imobempregos.sql` > Run; depois `20261103110226_assinaturas.sql` > Run; depois `20261103180000_ia_e_candidaturas.sql` > Run (IA e candidaturas); depois `20261103190000_candidaturas_qualquer_site.sql` > Run (candidatura de vaga de qualquer site; pode rodar de novo sem erro).
   - **Pela CLI:** `npx supabase@2 login`, `npx supabase@2 link --project-ref ikvjaowvpvxojvcfwnct`, `npx supabase@2 db push`. Atenção: o `db push` aplica todas as migrações pendentes da pasta; use o painel se o projeto tiver migrações de outros repositórios.
2. **Settings > Data API > Exposed schemas:** acrescente `imobempregos` à lista que já existe (não remova os outros).
3. **Authentication > URL Configuration > Redirect URLs:** acrescente `https://imobemprego.vercel.app/entrar` (sem mexer na *Site URL*). É para onde voltam os links dos e-mails de confirmação e de nova senha.
4. **Authentication > Sign In / Providers > Email:** confirme que a **confirmação de e-mail** está ligada (já está: conferido em 03/11/2026).
5. Copie de **Settings > API Keys** a chave **secret** para a Vercel (passo 4). A URL e a chave publishable já estão no `config.js`.

## 2. Asaas

1. Na sua conta do Asaas, comece pelo **sandbox** (ambiente de teste): [sandbox.asaas.com](https://sandbox.asaas.com). Crie lá uma chave de API.
2. Em **Minha conta > Informações**, informe o endereço do site (`https://imobemprego.vercel.app`). Não é preciso comprar domínio: é só para o Asaas aceitar devolver a pessoa ao app depois do pagamento com cartão.
3. Em **Integrações > Webhooks**, crie um webhook:
   - URL: `https://imobemprego.vercel.app/api/asaas-webhook`
   - Token de autenticação: uma senha longa e aleatória (mais de 32 caracteres). É o `ASAAS_WEBHOOK_TOKEN` abaixo.
   - Eventos: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`, `CHECKOUT_PAID`.
4. Em **Notificações**, deixe ligados os avisos de cobrança ao cliente (e-mail e, se quiser, WhatsApp): são eles que lembram quem paga por Pix.
5. Quando tudo funcionar no sandbox, repita na conta de produção e troque as variáveis do passo 4.

## 3. Ligar o app ao Supabase

Feito: `analisador-curriculo/config.js` já tem a URL do projeto e a chave publishable (pública por natureza; o acesso aos dados é controlado pelo RLS).

## 4. Vercel (projeto `wsasistemas/imobemprego`)

1. **Settings > Build and Deployment:** *Root Directory* **vazio** (a raiz do repositório) e os campos de build **sem sobrescrever** (*Override* desligado). Tudo vem do `vercel.json` na raiz do repositório:
   - instala as dependências do `package.json` da raiz (o SDK da Anthropic);
   - build `node analisador-curriculo/build.mjs`, que copia só os arquivos públicos para `analisador-curriculo/dist`, a pasta servida;
   - funções em `api/` (raiz), que chamam a lógica de `analisador-curriculo/lib/servidor/`;
   - cabeçalhos de segurança e endereços sem `.html` (`/entrar`, `/assinatura`).
2. **Settings > Environment Variables** (ambiente *Production*; marque as chaves como *Sensitive*):

   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://ikvjaowvpvxojvcfwnct.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | a mesma do `config.js` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` (secret) |
   | `ASAAS_API_KEY` | a chave de API do Asaas (secret) |
   | `ASAAS_AMBIENTE` | `sandbox` no teste, `producao` no lançamento |
   | `ASAAS_WEBHOOK_TOKEN` | o mesmo token do webhook do Asaas (secret) |
   | `SITE_URL` | `https://imobemprego.vercel.app` (ou seu domínio) |
   | `ANTHROPIC_API_KEY` | chave da API da Anthropic (secret), criada em platform.claude.com > API Keys. Coloque créditos e um limite de gasto mensal na conta |

   Não existe arquivo `.env` neste projeto: as variáveis ficam só no painel da Vercel. O repositório é público, então nenhuma chave secreta pode ir para arquivo.
3. **Deployments > Redeploy** no último deploy (variável nova só vale num deploy novo). Depois, a cada `git push` na branch `main`, a Vercel publica sozinha.
4. Confira: `https://imobemprego.vercel.app/` abre a tela de entrar, e `https://imobemprego.vercel.app/api/vagas?termo=teste` responde `{"erro":"Entre na sua conta para buscar vagas."}` (a função existe e exige login).
5. Domínio próprio, se quiser: **Settings > Domains**. Depois atualize `SITE_URL`, as *Redirect URLs* do Supabase e o endereço no Asaas.

O `build.mjs` copia para o site **só** a lista de arquivos públicos. O Vigia de Vagas, os testes e os scripts do Windows nunca vão para a internet.

## Testar antes de lançar (sandbox)

1. Criar uma conta no site e confirmar o e-mail.
2. Na tela Assinatura, assinar com **Pix** e pagar a cobrança pelo botão "Confirmar pagamento" do sandbox do Asaas. A tela deve mudar para "Assinatura ativa".
3. Com outra conta, assinar com **cartão** usando um cartão de teste do Asaas.
4. Cancelar uma assinatura e conferir que o acesso continua até o fim do período.
5. No Supabase (Table Editor > `assinaturas`), mudar o `teste_ate` de uma conta para ontem e conferir que o app manda para a tela de assinatura.

## Uso local, sem login

Com o `config.js` vazio, o app abre sem login e sem cobrança em `localhost`: `iniciar.bat`.

Para rodar as funções como na Vercel: `npx vercel@latest dev` na raiz do repositório (pede login na Vercel e puxa as variáveis do painel).

## Testes

- App e servidor: `cd analisador-curriculo && node --test teste.mjs teste-servidor.mjs` (47 testes: leitura de vaga por link com bloqueio de endereço interno, análise, Gupy, Vigia, cadastro, acesso, busca de vagas, assinar com Pix e cartão, cancelar, avisos do Asaas, IA para assinantes com limite de 25 por mês e as funções da Vercel, com Supabase, Asaas e IA simulados).
- Banco: `cd supabase/tests && npm install && npm test` (72 verificações: candidaturas de vaga de qualquer site pelo link, cadastro, RLS, teste grátis de 10 dias, regra de acesso, ninguém consegue se dar acesso, cadastros dos outros apps intactos, ativação de quem já tem login Imob, limite mensal da IA e candidaturas só para assinantes).

## Antes de divulgar

- **Termos e privacidade:** preencha os campos marcados (razão social, CNPJ, e-mail do encarregado, data) e peça a revisão de um advogado. Com cobrança, o Código de Defesa do Consumidor também vale: o cancelamento online já atende.
- **Nota fiscal:** cobrando mensalidade, você precisa emitir nota de serviço. O Asaas tem emissão automática de NFS-e; veja com seu contador.
- **Termos da Gupy:** o `robots.txt` libera as páginas usadas, mas um serviço pago que lê vagas da Gupy é uso comercial. Leia os termos de uso da Gupy e considere falar com eles.
- **WhatsApp:** é validado pelo formato. Confirmar que o número é da pessoa exige envio de código, que é pago.
- **Excluir conta (LGPD):** apagar o usuário no Supabase apaga perfil, assinatura e vagas salvas. Ainda falta um botão "apagar minha conta" no app.
- **Repositório público:** nunca faça commit das chaves secret do Supabase e do Asaas, de um `.env` ou do `vigia.json`.
