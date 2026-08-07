# UEF Loja — Gestión Académica y Analítica de Datos

Aplicación web construida con React, TypeScript, Vite y Supabase PostgreSQL para registrar estudiantes, docentes, cursos, materias, calificaciones, comportamiento, recuperación y reportes analíticos.

## Módulos incluidos

- Autenticación con roles `director` y `teacher`.
- Administración de estudiantes y matrículas por año lectivo.
- Administración de docentes y cuentas de acceso.
- Años lectivos, tres trimestres, cursos, materias y asignaciones docentes.
- Evaluaciones formativas del 70 % con tipos TAI, LO, LE, PE, TA-G, EXPO, EXP, PST, RP, INV, PROY, ENS, DBT, BLG, VID y PDC.
- Evaluación sumativa del 30 % con proyecto, evaluación inicial, mejora y refuerzo.
- Celdas vacías excluidas de los promedios: no se convierten en cero.
- Promedio trimestral, escala A+/A−/B+/B− y DAR/AAR/PAAR/NAAR.
- Comportamiento por trimestre como letra independiente.
- Recuperación anual por materia.
- Reportes individuales trimestrales y anuales.
- Reportes globales por curso, gráfico de barras, tendencias y pastel por umbral.
- Seguridad RLS para limitar a cada docente a sus asignaciones.
- Edge Function `admin-users` para administrar cuentas sin exponer la clave administrativa.
- GitHub Actions para desplegar en GitHub Pages.

## 1. Integrar el código en el directorio local

Directorio de trabajo definido:

```text
D:\UEF_LOJA_PROYECTO
```

Antes de copiar los archivos, conserve estos elementos locales:

- `.env.local`
- `supabase/config.toml`
- `supabase/.temp/`

Extraiga el ZIP y copie su contenido dentro de `D:\UEF_LOJA_PROYECTO`, aceptando reemplazar el código de la plantilla de Vite. El ZIP no contiene `.env.local` ni claves reales.

## 2. Instalar dependencias

```powershell
Set-Location -LiteralPath "D:\UEF_LOJA_PROYECTO"
npm install
```

## 3. Configurar variables locales

El archivo `.env.local` debe contener:

```env
VITE_SUPABASE_URL=https://SU_REFERENCIA.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SU_CLAVE
```

No coloque aquí `service_role`, `sb_secret_...` ni la contraseña PostgreSQL.

## 4. Aplicar la base de datos

El proyecto local ya debe estar vinculado al proyecto remoto:

```powershell
npx supabase projects list
```

Revise la migración:

```text
supabase/migrations/20260807000100_initial_schema.sql
```

Después aplíquela:

```powershell
npx supabase db push
```

La migración crea tablas, funciones de cálculo, vistas, índices, datos iniciales y políticas RLS.

## 5. Crear el primer director

1. En Supabase Dashboard abra `Authentication > Users`.
2. Cree el usuario director con correo y contraseña.
3. Confirme el correo desde el panel.
4. Abra `scripts/bootstrap-director.sql`.
5. Cambie el correo del ejemplo por el correo real.
6. Ejecute el bloque en `SQL Editor`.

## 6. Desplegar la función administrativa

```powershell
npx supabase functions deploy admin-users
```

No es necesario crear secretos personalizados con nombres `SUPABASE_URL`, `SUPABASE_ANON_KEY` o `SUPABASE_SERVICE_ROLE_KEY`; Supabase los proporciona internamente a la Edge Function.

## 7. Probar localmente

```powershell
npm run dev
```

Abra:

```text
http://localhost:5173
```

Ingrese con la cuenta director creada anteriormente.

## 8. Secuencia inicial dentro del sistema

1. Configuración académica → crear el año lectivo.
2. Configuración académica → crear cursos y paralelos.
3. Confirmar o crear materias.
4. Docentes → registrar docentes.
5. Usuarios y accesos → crear cuentas docentes.
6. Configuración académica → asignar docentes a curso y materia.
7. Estudiantes → registrar y matricular estudiantes.
8. Calificaciones → crear evaluaciones formativas y registrar notas.
9. Recuperación → registrar notas cuando corresponda.
10. Reportes y analítica → consultar resultados.

## 9. Compilar antes de subir

```powershell
npm run build
```

## 10. Guardar en GitHub

```powershell
git add .
git commit -m "feat: implementar sistema academico UEF Loja"
git push
```

Compruebe que `.env.local` no se incluya:

```powershell
git check-ignore -v .env.local
git status
```

## 11. Configurar GitHub Pages

En GitHub:

```text
Settings > Pages > Build and deployment > Source > GitHub Actions
```

En:

```text
Settings > Secrets and variables > Actions
```

cree:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Al hacer `push` a `main`, el flujo `.github/workflows/deploy.yml` compila y publica la aplicación.

URL prevista:

```text
https://fernando058.github.io/uef-loja-proyecto/
```

## 12. Configurar las redirecciones de Supabase Auth

En `Authentication > URL Configuration`:

```text
Site URL:
https://fernando058.github.io/uef-loja-proyecto/
```

Redirect URLs:

```text
http://localhost:5173/**
https://fernando058.github.io/uef-loja-proyecto/**
```

## Seguridad

- Las claves administrativas no están en React.
- Las políticas RLS permanecen activas.
- Los docentes solo consultan y editan sus asignaciones.
- El director administra datos institucionales y cuentas.
- Las modificaciones principales se registran en `audit_log`.
- No suba nóminas reales, cédulas o respaldos de producción al repositorio público.
