# Agenda o Vigia de Vagas para rodar todo dia no Agendador de Tarefas do Windows.
# Nao precisa de administrador: a tarefa roda com o seu usuario, so quando voce
# esta logado. Se o computador estiver desligado no horario, roda quando ligar.
#
#   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1             # todo dia as 08:00
#   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1 -Hora 19:30
#   powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1 -Remover
#
# (Arquivo sem acentos de proposito: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.)

param(
  [string]$Hora = "08:00",
  [switch]$Remover
)

$ErrorActionPreference = "Stop"
$Nome = "Vigia de Vagas (Gupy)"
$Pasta = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Remover) {
  if (Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
    Write-Host "Tarefa '$Nome' removida."
  } else {
    Write-Host "A tarefa '$Nome' nao existe."
  }
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error "Node.js nao encontrado. Instale em https://nodejs.org e rode de novo."; exit 1 }

if (-not (Test-Path (Join-Path $Pasta "vigia.json"))) {
  Copy-Item (Join-Path $Pasta "vigia.exemplo.json") (Join-Path $Pasta "vigia.json")
  Write-Host "Criei vigia.json. Edite o caminho do curriculo e os termos de busca antes da primeira execucao:"
  Write-Host "  $(Join-Path $Pasta 'vigia.json')"
}

try { $quando = [datetime]::ParseExact($Hora, "HH:mm", $null) }
catch { Write-Error "Hora invalida: '$Hora'. Use HH:mm, por exemplo 08:00."; exit 1 }

$acao = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $Pasta 'vigia.mjs')`"" -WorkingDirectory $Pasta
$gatilho = New-ScheduledTaskTrigger -Daily -At $quando
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilho -Settings $config -Principal $principal `
  -Description "Busca vagas novas na Gupy, compara com o curriculo e abre o relatorio. Pasta: $Pasta" -Force | Out-Null

Write-Host "Pronto: '$Nome' vai rodar todo dia as $Hora."
Write-Host "Relatorios em: $(Join-Path $Pasta 'relatorios')"
Write-Host "Para testar agora: Start-ScheduledTask -TaskName '$Nome'"
Write-Host "Para remover:      powershell -ExecutionPolicy Bypass -File agendar-vigia.ps1 -Remover"
