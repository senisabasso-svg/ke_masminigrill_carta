import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

function slugify(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Tenés que ingresar' })

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json(401, { error: 'Tenés que ingresar' })

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (!profile || profile.role !== 'super') {
      return json(403, { error: 'No tenés permiso para esto' })
    }

    const body = await req.json()
    const action = String(body.action || '')
    const companyId = String(body.companyId || '')

    if (!companyId) return json(400, { error: 'Falta la empresa' })

    if (action === 'delete') {
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)

      const { error } = await admin.from('companies').delete().eq('id', companyId)
      if (error) return json(400, { error: error.message })

      for (const row of admins || []) {
        await admin.auth.admin.deleteUser(row.id)
      }

      try {
        const { data: files } = await admin.storage.from('menus').list(companyId, { limit: 1000 })
        if (files?.length) {
          await admin.storage.from('menus').remove(files.map((f) => `${companyId}/${f.name}`))
        }
      } catch {
        // ignore storage cleanup failures
      }

      return json(200, { ok: true })
    }

    if (action === 'update') {
      const patch: Record<string, unknown> = {}
      if (body.name != null) patch.name = String(body.name).trim()
      if (body.slug != null) patch.slug = slugify(body.slug)
      if (body.tagline != null) patch.tagline = String(body.tagline).trim().slice(0, 80)
      if (body.whatsapp != null) patch.whatsapp = String(body.whatsapp).trim().slice(0, 22)
      if (body.currency != null) patch.currency = String(body.currency).trim().slice(0, 6) || '$'
      if (body.logo_path != null) patch.logo_path = String(body.logo_path)
      if (body.active != null) patch.active = Boolean(body.active)

      if (Object.keys(patch).length) {
        const { error } = await admin.from('companies').update(patch).eq('id', companyId)
        if (error) {
          if (error.code === '23505') return json(400, { error: 'Ese link ya está usado' })
          return json(400, { error: error.message })
        }
      }

      const { data: adminProfile } = await admin
        .from('profiles')
        .select('id, username')
        .eq('company_id', companyId)
        .eq('role', 'admin')
        .maybeSingle()

      if (adminProfile && body.adminUsername) {
        const username = String(body.adminUsername).trim().toLowerCase()
        if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
          return json(400, { error: 'El usuario usa de 3 a 24 letras o números, sin espacios' })
        }
        const { error } = await admin
          .from('profiles')
          .update({ username })
          .eq('id', adminProfile.id)
        if (error) {
          if (error.code === '23505') return json(400, { error: 'Ese usuario ya existe' })
          return json(400, { error: error.message })
        }
      }

      if (adminProfile && body.adminPassword) {
        const password = String(body.adminPassword)
        if (password.length < 6) return json(400, { error: 'La clave del admin necesita al menos 6 caracteres' })
        const { error } = await admin.auth.admin.updateUserById(adminProfile.id, { password })
        if (error) return json(400, { error: error.message })
      }

      const { data: company } = await admin.from('companies').select('*').eq('id', companyId).single()
      const { data: admins } = await admin
        .from('profiles')
        .select('username')
        .eq('company_id', companyId)
        .eq('role', 'admin')
        .maybeSingle()

      return json(200, {
        company: {
          ...company,
          adminUsername: admins?.username || ''
        }
      })
    }

    return json(400, { error: 'Acción no reconocida' })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Error interno' })
  }
})
