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

function adminEmail(username: string, email?: string) {
  if (email && email.includes('@')) return email.trim().toLowerCase()
  const user = String(username || '').trim().toLowerCase()
  return `${user}@carta.local`
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
    const name = String(body.name || '').trim()
    const slug = slugify(body.slug || name)
    const username = String(body.adminUsername || '').trim().toLowerCase()
    const password = String(body.adminPassword || '')
    const email = adminEmail(username, body.adminEmail)

    if (name.length < 2) return json(400, { error: 'El nombre de la empresa es muy corto' })
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return json(400, { error: 'El identificador del link necesita letras o números' })
    }
    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      return json(400, { error: 'El usuario usa de 3 a 24 letras o números, sin espacios' })
    }
    if (password.length < 6) return json(400, { error: 'La clave del admin necesita al menos 6 caracteres' })

    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({
        name,
        slug,
        tagline: String(body.tagline || '').trim().slice(0, 80),
        whatsapp: String(body.whatsapp || '').trim().slice(0, 22),
        currency: String(body.currency || '$').trim().slice(0, 6) || '$',
        logo_path: String(body.logo_path || ''),
        active: true
      })
      .select('*')
      .single()

    if (companyError) {
      if (companyError.code === '23505') return json(400, { error: 'Ese link o usuario ya está usado' })
      return json(400, { error: companyError.message })
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role: 'admin', company_id: company.id }
    })

    if (createError || !created.user) {
      await admin.from('companies').delete().eq('id', company.id)
      if (String(createError?.message || '').toLowerCase().includes('already')) {
        return json(400, { error: 'Ese email o usuario ya existe' })
      }
      return json(400, { error: createError?.message || 'No se pudo crear el admin' })
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      role: 'admin',
      company_id: company.id,
      username
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      await admin.from('companies').delete().eq('id', company.id)
      if (profileError.code === '23505') return json(400, { error: 'Ese usuario ya existe' })
      return json(400, { error: profileError.message })
    }

    return json(200, {
      company: {
        ...company,
        adminUsername: username,
        adminEmail: email
      }
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Error interno' })
  }
})
