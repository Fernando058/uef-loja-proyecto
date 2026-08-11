import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Variables internas de Supabase incompletas.' }, 500)
  if (!authorization) return json({ error: 'Sesión requerida.' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

    const { data: caller, error: callerError } = await adminClient.from('profiles').select('role,active').eq('id', authData.user.id).single()
    if (callerError || caller?.role !== 'director' || !caller.active) return json({ error: 'Solo el director puede administrar cuentas.' }, 403)

    const body = await request.json()
    const action = String(body.action ?? '')

    if (action === 'list') {
      const { data: userPage, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw error
      const ids = userPage.users.map((user) => user.id)
      const { data: profiles, error: profileError } = ids.length
        ? await adminClient.from('profiles').select('id,first_names,last_names,role,active').in('id', ids)
        : { data: [], error: null }
      if (profileError) throw profileError
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      return json({ users: userPage.users.map((user) => ({ id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, profile: profileMap.get(user.id) ?? null })) })
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const firstNames = String(body.first_names ?? '').trim()
      const lastNames = String(body.last_names ?? '').trim()
      const role = body.role === 'director' ? 'director' : 'docente'
      const teacherId = body.teacher_id ? String(body.teacher_id) : null

      if (!email || !firstNames || !lastNames || password.length < 8) return json({ error: 'Datos incompletos o contraseña menor a 8 caracteres.' }, 400)
      if (role === 'docente' && !teacherId) return json({ error: 'Debe seleccionar el registro docente.' }, 400)

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_names: firstNames, last_names: lastNames, role },
      })
      if (createError || !created.user) throw createError ?? new Error('No se creó el usuario')

      try {
        const { error: profileError } = await adminClient.from('profiles').upsert({ id: created.user.id, email, first_names: firstNames, last_names: lastNames, role, active: true })
        if (profileError) throw profileError

        if (role === 'docente' && teacherId) {
          const { data: linked, error: teacherError } = await adminClient
            .from('teachers')
            .update({ profile_id: created.user.id, first_names: firstNames, last_names: lastNames, email })
            .eq('id', teacherId)
            .is('profile_id', null)
            .select('id')
            .maybeSingle()
          if (teacherError) throw teacherError
          if (!linked) throw new Error('El docente ya está vinculado a otra cuenta o no existe.')
        }
      } catch (linkError) {
        await adminClient.auth.admin.deleteUser(created.user.id)
        throw linkError
      }
      return json({ user_id: created.user.id, email })
    }

    if (action === 'update_password') {
      const userId = String(body.user_id ?? '')
      const password = String(body.password ?? '')
      if (!userId || password.length < 8) return json({ error: 'Datos de contraseña no válidos.' }, 400)
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'set_active') {
      const userId = String(body.user_id ?? '')
      const active = Boolean(body.active)
      if (!userId) return json({ error: 'Usuario no válido.' }, 400)
      if (userId === authData.user.id && !active) return json({ error: 'No puede deshabilitar su propia cuenta.' }, 400)
      const { error } = await adminClient.from('profiles').update({ active }).eq('id', userId)
      if (error) throw error
      return json({ success: true })
    }

    return json({ error: 'Acción no reconocida.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
