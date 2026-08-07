# admin-users

Función segura para listar y crear cuentas, cambiar contraseñas temporales y activar/desactivar perfiles.

Despliegue:

```powershell
npx supabase functions deploy admin-users
```

La función usa las variables internas administradas por Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

No deben crearse secretos personalizados con esos nombres ni copiarse al frontend.
