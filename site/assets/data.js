import {
  explainError,
  mapCompany,
  mapProduct,
  publicUrl,
  sb,
  toEmail
} from './shared.js'

function fail(error) {
  throw new Error(explainError(error))
}

export async function getSessionUser() {
  const { data, error } = await sb().auth.getSession()
  if (error) fail(error)
  if (!data.session?.user) return null

  const { data: profile, error: profileError } = await sb()
    .from('profiles')
    .select('id, role, company_id, username')
    .eq('id', data.session.user.id)
    .maybeSingle()

  if (profileError) fail(profileError)
  if (!profile) return null

  return {
    id: profile.id,
    role: profile.role,
    companyId: profile.company_id,
    username: profile.username,
    email: data.session.user.email
  }
}

export async function login(login, password) {
  const email = toEmail(login)
  const { error } = await sb().auth.signInWithPassword({ email, password })
  if (error) fail(error)
  return getSessionUser()
}

export async function logout() {
  const { error } = await sb().auth.signOut()
  if (error) fail(error)
}

export async function changePassword(nextPassword) {
  if (String(nextPassword || '').length < 6) throw new Error('La clave nueva necesita al menos 6 caracteres')
  const { error } = await sb().auth.updateUser({ password: nextPassword })
  if (error) fail(error)
}

export async function getPublicBaseUrl() {
  const { data, error } = await sb().from('settings').select('public_base_url').eq('id', 1).maybeSingle()
  if (error) fail(error)
  return (data?.public_base_url || '').replace(/\/$/, '')
}

export async function setPublicBaseUrl(url) {
  const { error } = await sb().from('settings').update({ public_base_url: url }).eq('id', 1)
  if (error) fail(error)
}

export function menuUrl(base, slug) {
  const origin = (base || location.origin).replace(/\/$/, '')
  return `${origin}/c/${slug}`
}

export async function getPublicMenu(slug) {
  const { data: company, error } = await sb()
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (error) fail(error)
  if (!company) return null

  const [{ data: categories, error: catError }, { data: products, error: prodError }] = await Promise.all([
    sb().from('categories').select('*').eq('company_id', company.id).order('sort'),
    sb().from('products').select('*').eq('company_id', company.id).eq('visible', true).order('sort')
  ])

  if (catError) fail(catError)
  if (prodError) fail(prodError)

  return {
    company: mapCompany(company),
    categories: (categories || [])
      .map((category) => ({
        id: category.id,
        name: category.name,
        products: (products || [])
          .filter((product) => product.category_id === category.id)
          .map(mapProduct)
      }))
      .filter((category) => category.products.length)
  }
}

export async function listCompanies() {
  const { data: companies, error } = await sb()
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) fail(error)

  const { data: profiles, error: profileError } = await sb()
    .from('profiles')
    .select('company_id, username, role')
    .eq('role', 'admin')

  if (profileError) fail(profileError)

  const [{ data: categories }, { data: products }] = await Promise.all([
    sb().from('categories').select('id, company_id'),
    sb().from('products').select('id, company_id')
  ])

  return (companies || []).map((company) => {
    const admin = (profiles || []).find((row) => row.company_id === company.id)
    return {
      ...mapCompany(company, admin?.username || ''),
      categoryCount: (categories || []).filter((row) => row.company_id === company.id).length,
      productCount: (products || []).filter((row) => row.company_id === company.id).length
    }
  })
}

export async function adminBundle(companyId) {
  const { data: company, error } = await sb().from('companies').select('*').eq('id', companyId).single()
  if (error) fail(error)

  const { data: adminProfile } = await sb()
    .from('profiles')
    .select('username')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .maybeSingle()

  const [{ data: categories, error: catError }, { data: products, error: prodError }] = await Promise.all([
    sb().from('categories').select('*').eq('company_id', companyId).order('sort'),
    sb().from('products').select('*').eq('company_id', companyId).order('sort')
  ])

  if (catError) fail(catError)
  if (prodError) fail(prodError)

  const publicBaseUrl = await getPublicBaseUrl()

  return {
    company: mapCompany(company, adminProfile?.username || ''),
    categories: (categories || []).map((row) => ({ id: row.id, name: row.name, sort: row.sort })),
    products: (products || []).map(mapProduct),
    publicUrl: menuUrl(publicBaseUrl || location.origin, company.slug)
  }
}

async function invoke(name, body) {
  const { data, error } = await sb().functions.invoke(name, { body })
  if (error) fail(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function createCompany(payload) {
  return invoke('create-company', payload)
}

export async function manageCompany(payload) {
  return invoke('manage-company', payload)
}

export async function updateCompanyLocal(companyId, patch) {
  const row = {}
  if (patch.name != null) row.name = patch.name
  if (patch.tagline != null) row.tagline = patch.tagline
  if (patch.whatsapp != null) row.whatsapp = patch.whatsapp
  if (patch.currency != null) row.currency = patch.currency
  if (patch.logo_path != null) row.logo_path = patch.logo_path

  const { data, error } = await sb().from('companies').update(row).eq('id', companyId).select('*').single()
  if (error) fail(error)
  return mapCompany(data)
}

export async function createCategory(companyId, name) {
  const { count } = await sb()
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const { data, error } = await sb()
    .from('categories')
    .insert({ company_id: companyId, name: String(name).trim(), sort: count || 0 })
    .select('*')
    .single()

  if (error) fail(error)
  return { id: data.id, name: data.name, sort: data.sort }
}

export async function renameCategory(categoryId, name) {
  const { data, error } = await sb()
    .from('categories')
    .update({ name: String(name).trim() })
    .eq('id', categoryId)
    .select('*')
    .single()
  if (error) fail(error)
  return { id: data.id, name: data.name, sort: data.sort }
}

export async function deleteCategory(categoryId) {
  const { error } = await sb().from('categories').delete().eq('id', categoryId)
  if (error) fail(error)
}

export async function moveCategory(companyId, categoryId, dir) {
  const { data, error } = await sb().from('categories').select('*').eq('company_id', companyId).order('sort')
  if (error) fail(error)
  await reorder(data || [], categoryId, dir, 'categories')
}

export async function createProduct(companyId, input) {
  const { count } = await sb()
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', input.categoryId)

  const { data, error } = await sb()
    .from('products')
    .insert({
      company_id: companyId,
      category_id: input.categoryId,
      name: input.name,
      description: input.description || '',
      price: Number(input.price),
      image_path: input.imagePath || '',
      sort: count || 0,
      visible: input.visible !== false
    })
    .select('*')
    .single()

  if (error) fail(error)
  return mapProduct(data)
}

export async function updateProduct(productId, input) {
  const row = {}
  if (input.name != null) row.name = input.name
  if (input.description != null) row.description = input.description
  if (input.price != null) row.price = Number(input.price)
  if (input.categoryId != null) row.category_id = input.categoryId
  if (input.visible != null) row.visible = Boolean(input.visible)
  if (input.imagePath != null) row.image_path = input.imagePath

  const { data, error } = await sb().from('products').update(row).eq('id', productId).select('*').single()
  if (error) fail(error)
  return mapProduct(data)
}

export async function deleteProduct(productId) {
  const { data, error } = await sb().from('products').select('image_path, company_id').eq('id', productId).maybeSingle()
  if (error) fail(error)
  const { error: delError } = await sb().from('products').delete().eq('id', productId)
  if (delError) fail(delError)
  if (data?.image_path) await removeStoragePath(data.image_path)
}

export async function moveProduct(companyId, productId, dir) {
  const { data: product, error } = await sb().from('products').select('*').eq('id', productId).single()
  if (error) fail(error)
  const { data: siblings, error: listError } = await sb()
    .from('products')
    .select('*')
    .eq('category_id', product.category_id)
    .order('sort')
  if (listError) fail(listError)
  await reorder(siblings || [], productId, dir, 'products')
}

async function reorder(items, itemId, dir, table) {
  const index = items.findIndex((item) => item.id === itemId)
  const target = index + dir
  if (index < 0 || target < 0 || target >= items.length) return
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  for (let i = 0; i < copy.length; i += 1) {
    const { error } = await sb().from(table).update({ sort: i }).eq('id', copy[i].id)
    if (error) fail(error)
  }
}

function extFor(file) {
  if (file.type === 'image/jpeg') return '.jpg'
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  return ''
}

export async function uploadImage(companyId, file) {
  const ext = extFor(file)
  if (!ext) throw new Error('Usá una foto JPG, PNG o WEBP')
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera el tamaño permitido (5 MB)')

  const path = `${companyId}/${crypto.randomUUID()}${ext}`
  const { error } = await sb().storage.from('menus').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  })
  if (error) fail(error)
  return path
}

export async function removeStoragePath(path) {
  if (!path) return
  const { error } = await sb().storage.from('menus').remove([path])
  if (error) console.warn('No se pudo borrar archivo', path, error.message)
}

export { publicUrl }
