# UEF Loja · Fase 4 — Frontend V2

Este parche adapta el frontend React/Vite al esquema V2 ya instalado en Supabase.

## Incluye

- Navegación V2.
- Configuración académica compatible con `grade_levels`, `start_date`, `end_date` y `number`.
- CRUD de años lectivos, trimestres, cursos, asignaturas y asignaciones docentes.
- Estudiantes y matrículas V2.
- Docentes con vínculo `profile_id`.
- Usuarios con rol `docente` y Edge Function `admin-users` actualizada.
- Libro de calificaciones inteligente por subnivel:
  - 2.º–4.º: promedio simple.
  - 5.º–7.º: 70 % formativa + 30 % sumativa.
- Evaluaciones 1,00–10,00; vacío = NULL.
- Mejora directa y mejora con refuerzo desde el libro de calificaciones.
- Proyecto interdisciplinar con materias, indicadores, producto y exposición.
- Registro de supletorio para elegibles.
- Analítica básica V2 con resultados trimestrales y anuales.

## No incluye todavía

- Regla definitiva de promoción/repitencia.
- Conversión final del supletorio.
- Boletas V2 oficiales.
- Asistencia V2.
- Comportamiento y cualitativas V2.

Esos módulos se conectarán en la siguiente fase para evitar mezclar reglas todavía no cerradas.

## Instalación

1. Respaldar y subir el estado actual a GitHub.
2. Extraer este ZIP en la raíz del proyecto `D:\UEF_LOJA_PROYECTO` y reemplazar archivos.
3. Ejecutar `npm run build`.
4. Ejecutar `npx supabase functions deploy admin-users`.
5. Ejecutar `npm run dev`.
6. Probar primero como Director.
7. Cuando todo funcione, hacer commit/push a `main`.

No requiere `db push`: Fase 4 no añade una nueva migración SQL.
