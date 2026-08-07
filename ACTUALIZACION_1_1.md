# Actualización 1.1 — Boletas, asistencia y edición

Este parche es incremental. No elimina ni reinicia las tablas existentes.

## Incluye

- Submenú de Reportes y analítica.
- Analítica académica existente.
- Boletas individuales anuales y trimestrales.
- Vista de impresión compatible con Guardar como PDF.
- Asistencia resumida por estudiante y trimestre.
- Áreas cualitativas configurables.
- Catálogo editable de comportamiento.
- Edición de años, trimestres, cursos, materias y asignaciones.
- Edición mejorada de matrículas.
- Corrección del flujo de autenticación que evitaba la pantalla blanca.

## Aplicación

1. Extraer el ZIP en la raíz del proyecto y reemplazar archivos.
2. Ejecutar `npm run build`.
3. Ejecutar `npx supabase migration list`.
4. Ejecutar `npx supabase db push`.
5. Ejecutar `npm run dev` y probar.
6. Confirmar y subir los cambios a GitHub.

No ejecutar `supabase db reset`.
