import { z } from 'zod'

export const studentSchema = z.object({
  first_names: z.string().trim().min(2, 'Ingrese los nombres'),
  last_names: z.string().trim().min(2, 'Ingrese los apellidos'),
  national_id: z.string().trim().max(20).optional().or(z.literal('')),
  birth_date: z.string().optional().or(z.literal('')),
  active: z.boolean(),
})

export const teacherSchema = z.object({
  first_names: z.string().trim().min(2, 'Ingrese los nombres'),
  last_names: z.string().trim().min(2, 'Ingrese los apellidos'),
  national_id: z.string().trim().max(20).optional().or(z.literal('')),
  active: z.boolean(),
})

export const loginSchema = z.object({
  email: z.string().email('Correo no válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})
