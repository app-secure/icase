# ==============================================================================
# I-CASE Docker Performance & Resource Monitor (PowerShell)
# Periodic sampling of CPU, RAM, Network & Disk I/O across active containers.
# Outputs to CSV for performance and non-functional evaluation (RNF-01 / RNF-02).
# ==============================================================================

[CmdletBinding()]
param (
    [int]$IntervalSeconds = 2,
    [string]$OutputFile = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $resultsDir = Join-Path $scriptDir "results"
    if (-not (Test-Path $resultsDir)) {
        New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
    }
    $OutputFile = Join-Path $resultsDir "docker-stats.csv"
}

# Inicializar cabecera CSV si el archivo no existe
if (-not (Test-Path $OutputFile) -or (Get-Item $OutputFile).Length -eq 0) {
    "Timestamp,Container,CPUPerc,MemUsage,MemPerc,NetIO,BlockIO" | Out-File -FilePath $OutputFile -Encoding utf8
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "[I-CASE Monitor] Iniciando captura de métricas Docker en PowerShell..." -ForegroundColor Green
Write-Host "[I-CASE Monitor] Intervalo de muestreo: $IntervalSeconds segundos" -ForegroundColor Gray
Write-Host "[I-CASE Monitor] Destino CSV: $OutputFile" -ForegroundColor Yellow
Write-Host "[I-CASE Monitor] Presiona [Ctrl + C] para finalizar el monitoreo." -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

try {
    while ($true) {
        $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        
        try {
            $statsOutput = & docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" 2>$null
            if ($LASTEXITCODE -eq 0 -and $statsOutput) {
                foreach ($line in $statsOutput) {
                    if (-not [string]::IsNullOrWhiteSpace($line)) {
                        $csvLine = "$timestamp,$line"
                        $csvLine | Out-File -FilePath $OutputFile -Append -Encoding utf8
                        Write-Host "[$timestamp] $line" -ForegroundColor Gray
                    }
                }
            } else {
                Write-Host "[$timestamp] No se detectaron contenedores activos o Docker no está en ejecución." -ForegroundColor DarkGray
            }
        } catch {
            Write-Warning "[$timestamp] Error consultando docker stats: $_"
        }

        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    Write-Host "`n[I-CASE Monitor] Monitoreo finalizado. Métricas almacenadas en: $OutputFile" -ForegroundColor Green
}
