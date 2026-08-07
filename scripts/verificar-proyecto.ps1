$ErrorActionPreference = "Stop"

Write-Host "Verificando proyecto UEF Loja..." -ForegroundColor Cyan

if (-not (Test-Path ".\package.json")) {
  throw "Ejecute este script desde la raíz D:\UEF_LOJA_PROYECTO"
}

Write-Host "Node:" -NoNewline
node -v
Write-Host "npm:" -NoNewline
npm -v
Write-Host "Supabase CLI:" -NoNewline
npx supabase --version

if (-not (Test-Path ".\.env.local")) {
  Write-Warning "Falta .env.local"
} else {
  Write-Host ".env.local encontrado y debe permanecer ignorado por Git." -ForegroundColor Green
  git check-ignore -v .env.local
}

npm run build
Write-Host "Compilación finalizada correctamente." -ForegroundColor Green
