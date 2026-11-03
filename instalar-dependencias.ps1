# Instala o que o AI Job Search precisa para o /apply completo e para o /scrape.
#
#   powershell -ExecutionPolicy Bypass -File instalar-dependencias.ps1 -Verificar   # so mostra o que falta
#   powershell -ExecutionPolicy Bypass -File instalar-dependencias.ps1              # instala o que falta
#   powershell -ExecutionPolicy Bypass -File instalar-dependencias.ps1 -SemLatex    # pula o MiKTeX (~1 GB)
#
# Usa o winget (ja vem no Windows 11). Cada instalador pode pedir confirmacao.
# (Arquivo sem acentos de proposito: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.)

param([switch]$Verificar, [switch]$SemLatex)

$ErrorActionPreference = "Continue"

function Atualizar-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

# O "python" da Microsoft Store e so um atalho que abre a loja: nao conta.
function Python-Real {
  foreach ($c in @("py", "python", "python3")) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notmatch "WindowsApps") {
      $v = & $cmd.Source --version 2>$null
      if ($LASTEXITCODE -eq 0 -and $v -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) { return $cmd.Source }
    }
  }
  return $null
}

function Tem($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function Situacao {
  $py = Python-Real
  $pypdf = $false
  if ($py) { & $py -c "import pypdf" 2>$null; $pypdf = ($LASTEXITCODE -eq 0) }
  [ordered]@{
    "Python 3.10+" = [bool]$py
    "pypdf"        = $pypdf
    "LaTeX"        = (Tem "lualatex") -and (Tem "xelatex")
    "Bun"          = Tem "bun"
    "Node.js"      = Tem "node"
  }
}

function Mostrar($s) {
  foreach ($k in $s.Keys) {
    $marca = if ($s[$k]) { "[ok]    " } else { "[falta] " }
    Write-Host "$marca$k"
  }
}

Write-Host "Situacao atual:"
$s = Situacao
Mostrar $s
if ($Verificar) { exit 0 }

if (-not (Tem "winget")) {
  Write-Host "`nwinget nao encontrado. Instale o 'Instalador de Aplicativo' pela Microsoft Store e rode de novo."
  exit 1
}

function Instalar($id, $nome) {
  Write-Host "`nInstalando $nome ($id)..."
  winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements
  Atualizar-Path
}

if (-not $s["Python 3.10+"]) { Instalar "Python.Python.3.12" "Python 3.12" }
$py = Python-Real
if ($py -and -not (Situacao)["pypdf"]) {
  Write-Host "`nInstalando pypdf..."
  & $py -m pip install --user pypdf
}
if (-not $s["LaTeX"] -and -not $SemLatex) {
  Instalar "MiKTeX.MiKTeX" "MiKTeX (LaTeX)"
  # Sem isso o MiKTeX para a cada pacote que falta perguntando se pode instalar.
  if (Tem "initexmf") { initexmf --set-config-value "[MPM]AutoInstall=1" | Out-Null }
}
if (-not $s["Bun"]) { Instalar "Oven-sh.Bun" "Bun" }

Write-Host "`nDepois da instalacao:"
Mostrar (Situacao)

if (-not (Python-Real)) {
  Write-Host "`nSe o Python continuar como [falta], desative o atalho da loja:"
  Write-Host "  Configuracoes > Aplicativos > Configuracoes avancadas > Aliases de execucao do aplicativo"
  Write-Host "  e desligue 'python.exe' e 'python3.exe'. Depois abra um terminal novo."
}
Write-Host "`nFeche e abra o VS Code / terminal para o PATH novo valer."
