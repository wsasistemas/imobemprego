# Publicar o imobempregos na internet

## Precisa de Supabase?

**Para publicar o analisador, não.** A análise do currículo roda no navegador de quem usa, e as duas consultas à Gupy rodam como funções da Vercel. Dá para pôr no ar hoje, de graça, sem banco.

**O Supabase entra quando o app tiver contas de usuário.** O schema `imobempregos` já está pronto para isso:

| Tabela | Para quê | Quem acessa |
|---|---|---|
| `perfis` | Nome, cidade e UF. Criado sozinho no cadastro | Só o dono |
| `buscas_salvas` | Buscas que a pessoa quer repetir (o Vigia de Vagas na nuvem, com alerta por e-mail) | Só o dono |
| `vagas_usuario` | Vagas salvas, nota, requisitos que faltam, status da candidatura, anotações | Só o dono |
| `vagas` | Cache das vagas públicas lidas na Gupy | Todos leem; só o servidor grava |

O currículo **nunca** vai para o banco. Isso é um diferencial para divulgar: "seu currículo não sai do seu computador".

## 1. Pôr no ar na Vercel (sem banco)

1. Crie uma conta em [vercel.com](https://vercel.com) entrando com o GitHub.
2. **Add New > Project**, escolha o repositório `wsasistemas/imobemprego`.
3. Em **Root Directory**, escolha `analisador-curriculo`. Framework: **Other**. Não precisa de comando de build.
4. **Deploy**. O site fica em `https://<nome>.vercel.app`. Domínio próprio (ex.: `imobempregos.com.br`) em **Settings > Domains**.

A cada `git push` na branch `main`, a Vercel publica a versão nova sozinha.

O que vai para o ar: `index.html`, `analisador.js`, `gupy.mjs` e a pasta `api/`. O Vigia, os scripts do Windows e os testes ficam de fora (`.vercelignore`).

## 2. Criar o banco no Supabase (quando for ter contas)

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo, `sa-east-1`).
2. Aplique a migração `supabase/migrations/20261103100327_schema_imobempregos.sql`. Escolha um jeito:
   - **Pelo painel:** SQL Editor > cole o arquivo inteiro > Run.
   - **Pela CLI:** `npx supabase@2 login`, `npx supabase@2 link --project-ref <ref>`, `npx supabase@2 db push`.
3. **Settings > Data API > Exposed schemas:** inclua `imobempregos`. Sem isso a API não enxerga as tabelas.
4. Na Vercel, em **Settings > Environment Variables**, crie:
   - `SUPABASE_URL` = `https://<ref>.supabase.co`
   - `SUPABASE_SECRET_KEY` = a chave **secret** (Settings > API Keys). Ela fica só no servidor. Nunca coloque essa chave no `index.html`.

   Com isso, cada vaga lida pelo site passa a ser gravada na tabela `vagas`.
5. Para a página falar com o banco (login, salvar vagas), use a chave **publishable**, que pode ir no navegador, junto com `supabase-js` numa versão fixa.

A migração foi testada num Postgres local com uma versão mínima do `auth` do Supabase: 18 verificações de RLS (um usuário não vê, não edita e não apaga dados de outro; anônimo só lê `vagas`).

## Cuidados antes de divulgar

- **Termos da Gupy.** O `robots.txt` da Gupy libera as páginas usadas, mas um site público que lê vagas da Gupy para muita gente é diferente de uso pessoal. Leia os termos de uso da Gupy antes de divulgar, e considere falar com eles. O cache da Vercel ajuda: a mesma busca vira uma consulta só a cada 10 minutos.
- **LGPD.** Com contas de usuário, publique uma política de privacidade dizendo o que fica guardado (perfil, buscas, vagas salvas) e que o currículo não é enviado. Ofereça "apagar minha conta": apagar o usuário no Supabase já apaga todos os dados dele (`on delete cascade`).
- **Repositório público.** O `wsasistemas/imobemprego` é público. Nunca faça commit de `.env`, de chaves do Supabase ou do seu `vigia.json`. O `.gitignore` já bloqueia esses arquivos.
