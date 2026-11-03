# Publicar o ImobEmpregos na internet

## Como o app funciona

- **Acesso só com login** (e-mail e senha). O cadastro pede nome, WhatsApp, e-mail e senha.
- **10 dias grátis, sem cartão.** Depois, **R$ 10 por mês**, por Pix ou cartão, **sem fidelidade**: a pessoa cancela no app e usa até o fim do período pago.
- Páginas: `entrar.html` (entrar, criar conta, senhas), `index.html` (o app), `assinatura.html` (plano, pagar, cancelar), `termos.html`, `privacidade.html`.
- **Instalável no celular** (Android: Chrome > "Instalar app"; iPhone: Safari > Compartilhar > "Adicionar à Tela de Início").
- O **currículo nunca sai do aparelho**. O **CPF** vai só para o Asaas, no momento de assinar; não fica no nosso banco.

| Peça | Serviço | Custo para começar |
|---|---|---|
| Site e funções | Cloudflare Pages | Grátis, uso comercial permitido |
| Contas e banco | Supabase | Grátis até 50 mil usuários/mês (pausa após 7 dias sem uso: o próprio uso diário evita) |
| Cobrança | Asaas | Sem mensalidade; taxa por cobrança paga. Confira a tabela atual: numa mensalidade de R$ 10, a taxa pesa |
| Domínio `.com.br` | Registro.br | Cerca de R$ 40 por ano (opcional: `imobempregos.pages.dev` é grátis) |

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
   - **Pelo painel:** SQL Editor > cole `20261103100327_schema_imobempregos.sql` > Run; depois `20261103110226_assinaturas.sql` > Run.
   - **Pela CLI:** `npx supabase@2 login`, `npx supabase@2 link --project-ref ikvjaowvpvxojvcfwnct`, `npx supabase@2 db push`. Atenção: o `db push` aplica todas as migrações pendentes da pasta; use o painel se o projeto tiver migrações de outros repositórios.
2. **Settings > Data API > Exposed schemas:** acrescente `imobempregos` à lista que já existe (não remova os outros).
3. **Authentication > URL Configuration > Redirect URLs:** acrescente `https://<seu-site>/entrar` (sem mexer na *Site URL*).
4. **Authentication > Sign In / Providers > Email:** confirme que a **confirmação de e-mail** está ligada (já está: conferido em 03/11/2026).
5. Copie de **Settings > API Keys** a chave **secret** para a Cloudflare (passo 4). A URL e a chave publishable já estão no `config.js`.

## 2. Asaas

1. Na sua conta do Asaas, comece pelo **sandbox** (ambiente de teste): [sandbox.asaas.com](https://sandbox.asaas.com). Crie lá uma chave de API.
2. Em **Minha conta > Informações**, cadastre o domínio do site. O Checkout só volta para domínios cadastrados.
3. Em **Integrações > Webhooks**, crie um webhook:
   - URL: `https://<seu-site>/api/asaas-webhook`
   - Token de autenticação: uma senha longa e aleatória (mais de 32 caracteres). É o `ASAAS_WEBHOOK_TOKEN` abaixo.
   - Eventos: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`, `CHECKOUT_PAID`.
4. Em **Notificações**, deixe ligados os avisos de cobrança ao cliente (e-mail e, se quiser, WhatsApp): são eles que lembram quem paga por Pix.
5. Quando tudo funcionar no sandbox, repita na conta de produção e troque as variáveis do passo 4.

## 3. Ligar o app ao Supabase

Feito: `analisador-curriculo/config.js` já tem a URL do projeto e a chave publishable (pública por natureza; o acesso aos dados é controlado pelo RLS).

## 4. Cloudflare Pages

1. Crie uma conta em [dash.cloudflare.com](https://dash.cloudflare.com) > **Workers & Pages > Create > Pages > Connect to Git** > repositório `wsasistemas/imobemprego`.
2. Configuração do build:
   - **Root directory:** `analisador-curriculo`
   - **Build command:** `node build.mjs`
   - **Build output directory:** `dist`
3. **Settings > Variables and Secrets** (marque as chaves como *Secret*):

   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://ikvjaowvpvxojvcfwnct.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | a mesma do `config.js` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` (secret) |
   | `ASAAS_API_KEY` | a chave de API do Asaas (secret) |
   | `ASAAS_AMBIENTE` | `sandbox` no teste, `producao` no lançamento |
   | `ASAAS_WEBHOOK_TOKEN` | o mesmo token do webhook do Asaas (secret) |
   | `SITE_URL` | `https://imobempregos.pages.dev` (ou seu domínio) |

4. **Deploy.** A cada `git push` na branch `main`, a Cloudflare publica de novo. Domínio próprio em **Custom domains**; depois atualize `SITE_URL`, a *Site URL* do Supabase e o domínio no Asaas.

O `build.mjs` copia para o site **só** a lista de arquivos públicos. O Vigia de Vagas, os testes e os scripts do Windows nunca vão para a internet.

## Testar antes de lançar (sandbox)

1. Criar uma conta no site e confirmar o e-mail.
2. Na tela Assinatura, assinar com **Pix** e pagar a cobrança pelo botão "Confirmar pagamento" do sandbox do Asaas. A tela deve mudar para "Assinatura ativa".
3. Com outra conta, assinar com **cartão** usando um cartão de teste do Asaas.
4. Cancelar uma assinatura e conferir que o acesso continua até o fim do período.
5. No Supabase (Table Editor > `assinaturas`), mudar o `teste_ate` de uma conta para ontem e conferir que o app manda para a tela de assinatura.

## Uso local, sem login

Com o `config.js` vazio, o app abre sem login e sem cobrança em `localhost`: `iniciar.bat`.

Para rodar as funções como na Cloudflare: `node build.mjs` e depois `npx wrangler@4 pages dev dist`. Os segredos locais vão em `analisador-curriculo/.dev.vars`, que já está no `.gitignore`.

## Testes

- App e servidor: `cd analisador-curriculo && node --test teste.mjs teste-servidor.mjs` (32 testes: análise, Gupy, Vigia, cadastro, acesso, assinar com Pix e cartão, cancelar e os avisos do Asaas, com Supabase e Asaas simulados).
- Banco: `cd supabase/tests && npm install && npm test` (55 verificações: cadastro, RLS, teste grátis de 10 dias, regra de acesso, ninguém consegue se dar acesso, cadastros dos outros apps intactos e ativação de quem já tem login Imob).

## Antes de divulgar

- **Termos e privacidade:** preencha os campos marcados (razão social, CNPJ, e-mail do encarregado, data) e peça a revisão de um advogado. Com cobrança, o Código de Defesa do Consumidor também vale: o cancelamento online já atende.
- **Nota fiscal:** cobrando mensalidade, você precisa emitir nota de serviço. O Asaas tem emissão automática de NFS-e; veja com seu contador.
- **Termos da Gupy:** o `robots.txt` libera as páginas usadas, mas um serviço pago que lê vagas da Gupy é uso comercial. Leia os termos de uso da Gupy e considere falar com eles.
- **WhatsApp:** é validado pelo formato. Confirmar que o número é da pessoa exige envio de código, que é pago.
- **Excluir conta (LGPD):** apagar o usuário no Supabase apaga perfil, assinatura e vagas salvas. Ainda falta um botão "apagar minha conta" no app.
- **Repositório público:** nunca faça commit das chaves secret do Supabase e do Asaas, do `.dev.vars` ou do `vigia.json`.
