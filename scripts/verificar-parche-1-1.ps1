$ErrorActionPreference = 'Stop'

Write-Host 'Verificando compilación del frontend...' -ForegroundColor Cyan
npm run build

Write-Host "`nMigraciones locales y remotas:" -ForegroundColor Cyan
npx supabase migration list

Write-Host "`nVerificación terminada. Si la compilación fue correcta, aplique la migración con:" -ForegroundColor Green
Write-Host 'npx supabase db push' -ForegroundColor Yellow
