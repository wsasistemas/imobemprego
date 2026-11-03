# AI Job Search: análise do projeto e do que dá para automatizar

Base: projeto `ai-job-search` v1.7.3 (nesta pasta), o guia em PDF `ai-job-search-pt-br.pdf` (cauhi.com, 27/10/2026) e testes feitos nesta máquina em 02/11/2026.

## 1. O que o projeto é

O AI Job Search **não é um aplicativo**. É um conjunto de instruções (comandos e "skills" em Markdown) e scripts Python que transformam o Claude Code em assistente de candidatura. Quem faz o trabalho é o Claude Code. Os scripts fazem as checagens que precisam ser exatas.

| Parte | Onde está | O que faz |
|---|---|---|
| Comandos | `.claude/commands/` | `/setup`, `/apply`, `/interview`, `/outcome`, `/rank`, `/expand`, `/upskill`, `/html-report`, `/add-template`, `/add-portal`, `/gmail-sync`, `/notion-sync`, `/reset` |
| Regras de avaliação | `.claude/skills/job-application-assistant/` | Perfil, estilo de escrita, nota de aderência (5 dimensões + filtro de idioma e de elegibilidade), modelos de CV e carta, preparo de entrevista |
| Agentes | `.claude/agents/` | Buscador de vaga (só leitura), avaliador de vaga, revisor |
| Busca de vagas | `.agents/skills/*-search/` | CLIs em TypeScript/Bun: 4 portais dinamarqueses, LinkedIn (endpoint público) e freehire.me |
| Scripts | `tools/` | `posting_guard.py` (limpa a vaga e aponta instruções escondidas), `verify_pdf.py` e `verify_layout.py` (conferem o PDF), `fetch_page.py` (respeita robots.txt) |
| Modelos | `cv/`, `cover_letters/` | Currículo em LaTeX (moderncv) e carta (cover.cls) |
| Testes | `tests/` | 55 arquivos de teste em Python |

A regra central, repetida em todo o projeto: **nada é inventado**. Cada afirmação do currículo precisa existir no perfil, e o que falta fica registrado como lacuna.

## 2. Situação desta máquina

| Requisito | Situação | Para que serve |
|---|---|---|
| Claude Code | ✅ em uso | Roda todos os comandos |
| Node.js 26 | ✅ instalado | Roda o novo Analisador de Currículo |
| pdftotext | ✅ instalado | Checagem de ATS do `/apply` (alternativa ao pypdf) |
| Python 3.10+ | ❌ ausente (só o atalho da Microsoft Store) | `posting_guard`, `verify_pdf`, salário, testes |
| LaTeX (lualatex + xelatex) | ❌ ausente | Gerar os PDFs do currículo e da carta |
| Bun | ❌ ausente | Só para a busca automática (`/scrape`) |

**Conclusão:** hoje o `/apply` não termina aqui, porque ele exige compilar os PDFs e rodar os scripts Python. Para liberar, no PowerShell:

```powershell
winget install Python.Python.3.12
winget install MiKTeX.MiKTeX
pip install pypdf
winget install Oven-sh.Bun   # opcional, só para /scrape
```

Depois da instalação do Python, desative o atalho da Microsoft Store em *Configurações > Aplicativos > Configurações avançadas > Aliases de execução do aplicativo* (`python.exe` e `python3.exe`). Senão, o comando `python` continua abrindo a loja.

## 3. O que foi montado: Analisador de Currículo

Pasta `analisador-curriculo/`, fora do projeto original para não atrapalhar atualizações. Abre com `iniciar.bat`. Detalhes no `LEIAME.md` da pasta.

- Lê o currículo em PDF e mostra o texto que um ATS extrai.
- Dá três notas: aderência à vaga, leitura por ATS e qualidade do texto. Também lista o que melhorar, por prioridade.
- Entende a estrutura das vagas da Gupy ("Responsabilidades e atribuições", "Requisitos e qualificações"…). Requisito pesa mais que diferencial, e o que aparece só em benefícios não conta (ex.: "curso de inglês gratuito").
- **Busca vagas reais na Gupy** e ordena pela aderência ao seu currículo. Um clique leva a vaga para a análise.
- Gera o comando `/apply` com a vaga, pronto para colar no Claude Code.
- Não usa IA e não envia o currículo para lugar nenhum. 11 testes automatizados (10 locais + 1 ao vivo contra a Gupy) passando.

## 4. O que dá para automatizar

### Montar o currículo

| Etapa | No projeto hoje | Automatizável? | Como |
|---|---|---|---|
| Montar o perfil | `/setup` lê `documents/` (CV, exportação do LinkedIn, diplomas) | ✅ já automatizado | Coloque o PDF do CV e a exportação do LinkedIn em `documents/` antes do `/setup` |
| Avaliar aderência | `/apply` passo 1, `/rank` em lote | ✅ já automatizado | O analisador faz uma pré-triagem grátis, e o `/apply` fica para as vagas boas, economizando o limite do plano |
| Escrever CV e carta | `/apply` com revisor | ✅ já automatizado | Precisa de LaTeX instalado |
| Checar ATS no PDF | `verify_pdf.py` | ✅ já automatizado | Precisa de Python + pypdf (ou o pdftotext já instalado) |
| Currículo em português | `/setup` pergunta o idioma (padrão: inglês) | ⚠️ manual | Responda "português" no `/setup`. Os títulos das seções do LaTeX precisam ser traduzidos (o projeto já prevê isso no checklist) |
| Modelo de CV brasileiro | Modelo moderncv (2 páginas) | ✅ via `/add-template` | Registre um modelo de 1 página, sem foto e sem CPF, que é o mais comum no Brasil |
| Formulários da Gupy | Não existe | ⚠️ parcial | Dá para gerar respostas para as perguntas do formulário (o `08-application-forms.md` já cobre). O preenchimento e o envio ficam com você |

### Buscar e se conectar a vagas

| Fonte | Situação | Recomendação |
|---|---|---|
| **Gupy** | Página pública traz as vagas em JSON; o `robots.txt` permite. Testado e funcionando no analisador | ✅ Feito: skill `gupy-search` (seção 5). O `/scrape` e o `/rank` já incluem vagas brasileiras |
| **LinkedIn** | O projeto já tem `linkedin-search` (endpoint público, `-l "Brasil"`) | ⚠️ Funciona, mas os termos de uso do LinkedIn proíbem acesso automatizado. Use pouco, ou só copie e cole |
| **Indeed, Catho, InfoJobs, Vagas.com** | Proteção contra robôs e termos restritivos | 🔗 Só links de busca prontos (o analisador já gera). Cole o texto da vaga no `/apply` |
| **Sites de carreira das empresas** | Muitas usam Gupy (`empresa.gupy.io`) ou ATS conhecidos (Greenhouse, Lever, Workday) | ✅ O `/apply` já aceita a URL e confere se o domínio é de um ATS conhecido |
| **E-mail** | `/gmail-sync` lê convites e recusas | ✅ Funciona com o conector do Gmail; propõe mudanças e você aprova |
| **Acompanhamento** | `/outcome`, `/html-report`, `/notion-sync` | ✅ Planilha, painel HTML e Notion já existem |

### O que não deve ser automatizado

- **Enviar candidaturas.** O projeto para antes do "enviar" de propósito. Robôs que se candidatam violam os termos da Gupy e do LinkedIn e derrubam a qualidade das candidaturas. Quem revisa e clica é você.
- **Preencher lacunas.** Nenhuma etapa deve colocar no currículo uma habilidade que você não tem, nem para "passar no ATS".
- **Volume alto de raspagem.** Busca pessoal, com cache e intervalo, como o analisador faz.

## 5. O que foi automatizado (03/11/2026)

| O quê | Onde | Situação |
|---|---|---|
| **Skill `gupy-search`** para o `/scrape` e o `/rank` | `ai-job-search/.agents/skills/gupy-search/` | ✅ Pronta e testada ao vivo. Comandos `search` (termo, UF, remoto/híbrido/presencial, últimos N dias, páginas) e `detail` (vaga completa com as seções da Gupy). 23 testes, typecheck ok. Roda com Bun ou com o Node já instalado (`node .agents/skills/gupy-search/cli/src/cli.ts ...`) |
| **Vigia de Vagas**: busca diária automática | `analisador-curriculo/vigia.mjs` | ✅ Pronto. Busca os termos do `vigia.json`, pula vagas já vistas, lê cada vaga nova por completo, dá a nota pelo seu currículo e abre um relatório HTML com botão "Copiar /apply" |
| Agendamento diário | `analisador-curriculo/agendar-vigia.ps1` | ⏳ Script pronto; falta você preencher o `vigia.json` e rodar o script uma vez |
| Nota da busca no analisador | `index.html`, `gupy.mjs`, `servidor.mjs` | ✅ Corrigido. Antes a nota usava só a apresentação da empresa (a busca da Gupy não traz requisitos). Agora o app lê a página de cada vaga e recalcula |
| "Ensino superior" falso ausente | `analisador.js` | ✅ "Bacharel", "licenciatura", "pós-graduação", "MBA" agora contam |
| Instalar dependências | `instalar-dependencias.ps1` | ⏳ Script pronto (`-Verificar` só mostra o que falta). Não foi executado: instala Python, MiKTeX (~1 GB) e Bun |

### Pendência: permissão da skill no projeto

O `/add-portal` pede para registrar a skill nas permissões do projeto. Essa edição foi bloqueada pela proteção do Claude Code (arquivo de permissões), então precisa ser feita à mão. Sem isso a skill funciona, mas o `/scrape` pede confirmação a cada busca na Gupy. Adicione a linha abaixo nos dois lugares:

```
"Bash(bun run .agents/skills/gupy-search/cli/src/cli.ts:*)",
```

- `ai-job-search/.claude/settings.json`, em `permissions.allow`, logo após a linha do `freehire-search`
- `ai-job-search/tools/security_guards.py`, em `ALLOWED_PERMISSIONS`, no mesmo ponto (a CI do projeto falha se as duas listas não baterem)

O `/scrape` chama as skills pelo Bun. Até o Bun ser instalado, ele usa a busca na web no lugar da skill.

## 6. Próximos passos sugeridos

1. Rodar `instalar-dependencias.ps1` para liberar o `/apply` completo (Python, MiKTeX, pypdf, Bun).
2. Copiar o projeto para um repositório **privado** (o fork do GitHub é sempre público, e o `/setup` grava seus dados).
3. Colocar seu currículo em `ai-job-search/documents/cv/` e rodar `/setup`, escolhendo português.
4. Preencher `analisador-curriculo/vigia.json` e rodar `agendar-vigia.ps1`. Todo dia chega um relatório com as vagas novas.
5. Mandar só as melhores vagas do relatório para o `/apply`.
