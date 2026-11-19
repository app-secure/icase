param([string]$EvidenceName = 'zip-delivery')
$ErrorActionPreference = 'Stop'
if ($EvidenceName -notmatch '^[a-z0-9-]+$') { throw 'Nombre de evidencias no válido' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('../verification-results/' + $EvidenceName)))
$zipPath = Join-Path $evidenceRoot 'entrega.zip'
$destination = [IO.Path]::GetFullPath((Join-Path $evidenceRoot ('extracted-' + [Guid]::NewGuid().ToString('N'))))
if (-not $destination.StartsWith($evidenceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino fuera de evidencias' }
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if ($archive.Entries.Count -gt 10000) { throw 'Demasiados archivos' }
  $totalSize = 0L
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if ($name -match '(^/|^[a-zA-Z]:|(^|/)\.\.(/|$))') { throw 'Ruta no segura en el ZIP' }
    $target = [IO.Path]::GetFullPath((Join-Path $destination $name))
    if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Entrada fuera del destino' }
    if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'No se admiten enlaces simbólicos' }
    $totalSize += $entry.Length
    if ($totalSize -gt 536870912) { throw 'ZIP demasiado grande para la prueba' }
  }
} finally { $archive.Dispose() }
Expand-Archive -LiteralPath $zipPath -DestinationPath $destination
Write-Output $destination
