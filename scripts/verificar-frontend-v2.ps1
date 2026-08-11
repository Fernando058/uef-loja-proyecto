$ErrorActionPreference = 'Stop'
Write-Host 'UEF Loja · Verificación Frontend V2' -ForegroundColor Cyan

$required = @(
  'src\pages\ProjectsPage.tsx',
  'src\pages\GradebookPage.tsx',
  'src\pages\ConfigurationPage.tsx',
  'src\types\domain.ts',
  'supabase\functions\admin-users\index.ts'
)

foreach ($file in $required) {
  if (-not (Test-Path $file)) { throw "Falta $file" }
  Write-Host "OK $file" -ForegroundColor Green
}

Write-Host 'Ejecutando compilación...' -ForegroundColor Yellow
npm run build

Write-Host 'Revisando migraciones remotas...' -ForegroundColor Yellow
npx supabase migration list

Write-Host 'Frontend V2 preparado para prueba local.' -ForegroundColor Green
