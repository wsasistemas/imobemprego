# Analisador de Currículo

App local que compara seu currículo com uma vaga, mostra como um sistema de triagem (ATS) lê o seu arquivo e busca vagas na Gupy, ordenadas por aderência ao seu currículo.

Ele complementa o [AI Job Search](../ai-job-search/): o analisador faz o diagnóstico rápido e gratuito, sem IA. O `/apply` do Claude Code escreve o currículo e a carta.

## Como abrir

**Com busca de vagas (recomendado):** dê dois cliques em `iniciar.bat`. O navegador abre em http://localhost:8765. Precisa do [Node.js](https://nodejs.org) 18 ou mais novo (já instalado nesta máquina).

**Só a análise:** abra o `index.html` direto no navegador.

## O que ele faz

| Recurso | Como funciona |
|---|---|
| Ler o currículo | PDF (via pdf.js) ou texto. Mostra o texto que um ATS consegue extrair do arquivo |
| Leitura por ATS | Contato em texto, seções com títulos padrão, caracteres ilegíveis, letras espaçadas, duas colunas, nº de páginas |
| Qualidade do texto | Resultados com números, verbos de ação, "responsável por", clichês, dados pessoais dispensáveis (CPF, estado civil, idade) |
| Aderência à vaga | Separa a vaga em Requisitos / Atividades / Diferenciais / Benefícios e cruza os termos com o currículo. Requisito pesa 3, atividade 2, diferencial 1, benefício 0 |
| Idiomas | Compara o nível pedido (básico → nativo) com o nível que aparece no currículo |
| Integridade da vaga | Aponta caracteres invisíveis e frases com cara de instrução para IA (versão simplificada do `posting_guard.py` do projeto) |
| Buscar vagas | Portal público da Gupy, com filtro por estado e "só remotas". Depois da busca, o app lê a página de cada vaga (requisitos e atividades) e recalcula a nota. Links prontos para LinkedIn, Indeed, Catho, InfoJobs e Vagas.com |
| Vigia de Vagas | Busca diária automática: só as vagas novas, lidas por completo, com nota e relatório HTML. Veja abaixo |
| Próximos passos | Relatório em Markdown e o comando `/apply` copiado com a vaga |

## Vigia de Vagas (busca diária automática)

Roda sem você abrir o app: busca na Gupy os termos que você escolher, pula as vagas que já viu, lê cada vaga nova por completo, dá a nota de aderência ao seu currículo e abre um relatório com as melhores primeiro. Cada vaga tem o botão **Copiar /apply** para levar ao Claude Code.

1. Rode `vigia.bat` uma vez. Ele cria o `vigia.json`.
2. Edite o `vigia.json`:

   | Campo | O que é |
   |---|---|
   | `curriculo` | Caminho do currículo em PDF ou TXT (PDF usa o `pdftotext` que vem com o Git) |
   | `buscas` | Lista de `{ "termo": "...", "estado": "São Paulo" }`. Use `"remoto": true` para só remotas. Estado com nome completo |
   | `paginas` | Páginas por busca (12 vagas cada, das mais novas). Padrão 1 |
   | `diasMaximos` | Ignora vagas publicadas há mais dias que isso. Padrão 14 |
   | `notaMinima` | Nota a partir da qual a vaga vai para "Melhores para você". Padrão 30 |
   | `maxVagasPorExecucao` | Teto de vagas lidas por vez (o resto fica para a próxima). Padrão 40 |
   | `abrirRelatorio` | Abre o relatório no navegador quando há vaga nova. Padrão `true` |

3. Rode `vigia.bat` de novo para testar. O relatório fica em `relatorios/vagas-AAAA-MM-DD.html` (e `relatorios/ultimo.html`).
4. Para rodar sozinho todo dia, no PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1             # todo dia às 08:00
   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1 -Hora 19:30
   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1 -Remover
   ```

   A tarefa roda com o seu usuário, sem administrador. Se o computador estiver desligado no horário, roda quando ligar.

O histórico fica em `dados/vistas.json` (apague para rever tudo) e o registro de execuções em `dados/vigia.log`. `vigia.json`, `dados/` e `relatorios/` estão no `.gitignore`, porque têm dados pessoais.

Volume: cada execução faz 1 consulta por página de busca e 1 por vaga nova, espaçadas em 1,5 s, com teto por execução.

## Privacidade

- O currículo é analisado **no navegador**. Ele não vai para o servidor local nem para a internet.
- Na busca, só o **termo e o estado** são enviados à Gupy, pelo servidor local (que escuta apenas em `127.0.0.1`). Para ler uma vaga, só o link dela.
- O Vigia lê o currículo no seu computador e grava os resultados só na pasta do app.
- O navegador lembra apenas o último termo de busca e a aba aberta.

## Limites

- As notas são regras fixas, não a decisão de um ATS real. Use como checklist.
- Termos que não estão no dicionário só aparecem se forem siglas (ex.: SPED, WMS). Para ampliar, edite a lista `BRUTO` em `analisador.js`.
- A busca do app mostra as 12 vagas mais recentes da Gupy para o termo. A leitura completa das 12 leva uns 20 segundos (as consultas são espaçadas); até lá a nota aparece como "…". Ela depende do formato da página pública da Gupy; se mudar, aparece a mensagem "A página da Gupy mudou de formato".
- Uso pessoal e em baixo volume: o servidor guarda cache (10 minutos para buscas, 6 horas para vagas) e faz no máximo uma consulta a cada 1,5 segundo.

## Testes

```
node --test teste.mjs
```

Para incluir o teste ao vivo contra a Gupy, no PowerShell:

```
$env:AO_VIVO=1; node --test teste.mjs
```

## Arquivos

- `index.html`: interface
- `analisador.js`: regras de análise (roda no navegador e no Node)
- `gupy.mjs`: busca e leitura das vagas da Gupy (lista e vaga completa)
- `vigia.mjs`, `vigia.exemplo.json`, `vigia.bat`, `agendar-vigia.ps1`: Vigia de Vagas
- `servidor.mjs`: servidor local (sem dependências)
- `teste.mjs`: testes
- `iniciar.bat`: atalho para abrir no Windows
