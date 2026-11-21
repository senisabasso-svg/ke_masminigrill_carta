import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const rootDir = path.resolve(__dirname, '..')
export const dataDir = path.join(rootDir, 'data')
export const uploadsDir = path.join(rootDir, 'uploads')
const dbPath = path.join(dataDir, 'db.json')

const INITIAL_SUPER_PASSWORD = 'ke-mas-2026'
const INITIAL_DEMO_PASSWORD = 'kmas-2026'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let queue = Promise.resolve()

export function ensure() {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(uploadsDir, { recursive: true })
  if (!fs.existsSync(dbPath)) seed()
}

export function read() {
  ensure()
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'))
}

function write(db) {
  const tmp = `${dbPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, dbPath)
}

function update(fn) {
  const run = queue.then(() => {
    const draft = structuredClone(read())
    const result = fn(draft)
    write(draft)
    return result
  })
  queue = run.then(() => undefined, () => undefined)
  return run
}

function id() {
  return crypto.randomUUID()
}

function bySort(a, b) {
  return a.sort - b.sort || String(a.name).localeCompare(String(b.name), 'es')
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function cleanName(value, label) {
  const text = String(value || '').trim()
  if (text.length < 2) throw new HttpError(400, `${label} es muy corto`)
  if (text.length > 60) throw new HttpError(400, `${label} es muy largo`)
  return text
}

function cleanSlug(value) {
  const slug = slugify(value)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) {
    throw new HttpError(400, 'El identificador del link necesita letras o números')
  }
  return slug
}

function cleanUsername(value) {
  const username = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw new HttpError(400, 'El usuario usa de 3 a 24 letras o números, sin espacios')
  }
  return username
}

function cleanPassword(value, label = 'La clave') {
  const password = String(value || '')
  if (password.length < 6) throw new HttpError(400, `${label} necesita al menos 6 caracteres`)
  if (password.length > 72) throw new HttpError(400, `${label} es muy larga`)
  return password
}

function cleanTagline(value) {
  const text = String(value || '').trim()
  if (text.length > 80) throw new HttpError(400, 'La frase es muy larga')
  return text
}

function cleanPhone(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!/^[0-9+\s()-]{6,22}$/.test(text)) throw new HttpError(400, 'El WhatsApp no parece un número')
  return text
}

function cleanCurrency(value) {
  const text = String(value || '').trim() || '$'
  if (text.length > 6) throw new HttpError(400, 'La moneda es muy larga')
  return text
}

function cleanProductName(value) {
  const text = String(value || '').trim()
  if (text.length < 2) throw new HttpError(400, 'El nombre del producto es muy corto')
  if (text.length > 80) throw new HttpError(400, 'El nombre del producto es muy largo')
  return text
}

function cleanDescription(value) {
  const text = String(value || '').trim()
  if (text.length > 280) throw new HttpError(400, 'La descripción es muy larga')
  return text
}

function cleanPrice(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(number) || number < 0 || number > 9999999) {
    throw new HttpError(400, 'El precio no es válido')
  }
  return Math.round(number * 100) / 100
}

function parseVisible(value, fallback = true) {
  if (value == null || value === '') return fallback
  return !(value === false || value === 'false' || value === '0')
}

function mustCompany(db, companyId) {
  const company = db.companies.find((item) => item.id === companyId)
  if (!company) throw new HttpError(404, 'No está el local')
  return company
}

function mustCategory(db, companyId, categoryId) {
  const category = db.categories.find((item) => item.id === categoryId && item.companyId === companyId)
  if (!category) throw new HttpError(400, 'Elegí una categoría de este local')
  return category
}

function mustProduct(db, companyId, productId) {
  const product = db.products.find((item) => item.id === productId && item.companyId === companyId)
  if (!product) throw new HttpError(404, 'No está ese producto')
  return product
}

function presentProduct(product) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    price: product.price,
    image: product.image,
    sort: product.sort,
    visible: product.visible
  }
}

function presentCompany(db, company) {
  const admin = db.users.find((user) => user.companyId === company.id && user.role === 'admin')
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    logo: company.logo,
    tagline: company.tagline,
    whatsapp: company.whatsapp,
    currency: company.currency,
    active: company.active,
    createdAt: company.createdAt,
    adminUsername: admin ? admin.username : '',
    productCount: db.products.filter((product) => product.companyId === company.id).length,
    categoryCount: db.categories.filter((category) => category.companyId === company.id).length
  }
}

function reorder(sorted, itemId, dir) {
  const index = sorted.findIndex((item) => item.id === itemId)
  const target = index + dir
  if (index < 0 || target < 0 || target >= sorted.length) return
  const [item] = sorted.splice(index, 1)
  sorted.splice(target, 0, item)
  sorted.forEach((entry, position) => {
    entry.sort = position
  })
}

function seed() {
  const companyId = id()
  const db = {
    settings: { publicBaseUrl: '' },
    users: [
      {
        id: id(),
        companyId: null,
        username: 'superadmin',
        passwordHash: bcrypt.hashSync(INITIAL_SUPER_PASSWORD, 10),
        role: 'super'
      },
      {
        id: id(),
        companyId,
        username: 'kmas',
        passwordHash: bcrypt.hashSync(INITIAL_DEMO_PASSWORD, 10),
        role: 'admin'
      }
    ],
    companies: [
      {
        id: companyId,
        name: 'Ke Más Mini Grill',
        slug: 'ke-mas-mini-grill',
        logo: '',
        tagline: 'Parrilla y minutas',
        whatsapp: '',
        currency: '$',
        active: true,
        createdAt: new Date().toISOString()
      }
    ],
    categories: [],
    products: []
  }

  const menu = [
    ['Parrilla', [
      ['Chorizo', 'A la parrilla, porción', 290],
      ['Morcilla', 'A la parrilla, porción', 280],
      ['Provoleta', 'Con orégano', 420],
      ['Entraña', 'Jugosa, al punto', 780],
      ['Vacío', 'Corte para compartir', 890],
      ['Asado de tira', 'Lento, a la parrilla', 940],
      ['Pollo', 'Deshuesado, porción', 620]
    ]],
    ['Minutas', [
      ['Milanesa napolitana', 'Con papas fritas', 750],
      ['Hamburguesa Ke Más', 'Doble carne, cheddar y cebolla', 690],
      ['Suprema', 'Con papas fritas', 680]
    ]],
    ['Guarniciones', [
      ['Papas fritas', 'Porción', 280],
      ['Ensalada mixta', 'Lechuga, tomate y cebolla', 260],
      ['Puré', 'Con manteca', 270]
    ]],
    ['Bebidas', [
      ['Agua', '500 ml', 120],
      ['Coca-Cola', '500 ml', 160],
      ['Cerveza', 'Lata 473 ml', 250],
      ['Limonada', 'Jarra', 240]
    ]],
    ['Postres', [
      ['Flan casero', 'Con dulce de leche', 280],
      ['Brownie', 'Con helado', 320]
    ]]
  ]

  menu.forEach(([categoryName, products], categoryIndex) => {
    const categoryId = id()
    db.categories.push({
      id: categoryId,
      companyId,
      name: categoryName,
      sort: categoryIndex
    })
    products.forEach(([name, description, price], productIndex) => {
      db.products.push({
        id: id(),
        companyId,
        categoryId,
        name,
        description,
        price,
        image: '',
        sort: productIndex,
        visible: true
      })
    })
  })

  write(db)
  fs.writeFileSync(path.join(dataDir, 'acceso.txt'), [
    'Claves iniciales. Se generan solo la primera vez que arranca el servidor.',
    'Si las cambiás en el panel, este archivo queda desactualizado.',
    '',
    'Superadmin',
    'Usuario: superadmin',
    `Clave: ${INITIAL_SUPER_PASSWORD}`,
    'Entrada: /super',
    '',
    'Local de prueba: Ke Más Mini Grill',
    'Usuario: kmas',
    `Clave: ${INITIAL_DEMO_PASSWORD}`,
    'Carta: /c/ke-mas-mini-grill',
    'Panel: /admin',
    ''
  ].join('\n'))
}

export function getSettings() {
  return { ...read().settings }
}

export function setPublicBaseUrl(publicBaseUrl) {
  return update((db) => {
    db.settings.publicBaseUrl = publicBaseUrl
    return { publicBaseUrl }
  })
}

export function listCompanies() {
  const db = read()
  return db.companies
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((company) => presentCompany(db, company))
}

export function getCompanyBySlug(slug) {
  const db = read()
  const company = db.companies.find((item) => item.slug === slug)
  return company ? presentCompany(db, company) : null
}

export function getPublicMenu(slug) {
  const db = read()
  const company = db.companies.find((item) => item.slug === slug && item.active)
  if (!company) return null
  const products = db.products.filter((product) => product.companyId === company.id && product.visible)
  const categories = db.categories
    .filter((category) => category.companyId === company.id)
    .sort(bySort)
    .map((category) => ({
      id: category.id,
      name: category.name,
      products: products
        .filter((product) => product.categoryId === category.id)
        .sort(bySort)
        .map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          image: product.image
        }))
    }))
    .filter((category) => category.products.length)

  return {
    company: {
      name: company.name,
      slug: company.slug,
      logo: company.logo,
      tagline: company.tagline,
      whatsapp: company.whatsapp,
      currency: company.currency
    },
    categories
  }
}

export function authenticate(username, password) {
  const db = read()
  const key = String(username || '').trim().toLowerCase()
  const user = db.users.find((item) => item.username === key)
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    throw new HttpError(401, 'Usuario o clave incorrectos')
  }
  if (user.role === 'admin') {
    const company = db.companies.find((item) => item.id === user.companyId)
    if (!company || !company.active) throw new HttpError(403, 'Este local está pausado')
  }
  return {
    id: user.id,
    role: user.role,
    companyId: user.companyId,
    username: user.username
  }
}

export function changePassword(userId, current, nextPassword) {
  return update((db) => {
    const user = db.users.find((item) => item.id === userId)
    if (!user) throw new HttpError(404, 'No está el usuario')
    if (!bcrypt.compareSync(String(current || ''), user.passwordHash)) {
      throw new HttpError(400, 'La clave actual no coincide')
    }
    user.passwordHash = bcrypt.hashSync(cleanPassword(nextPassword, 'La clave nueva'), 10)
    return { ok: true }
  })
}

export function assertNewCompany(input) {
  const db = read()
  const name = cleanName(input.name, 'El nombre de la empresa')
  const slug = cleanSlug(input.slug || name)
  if (db.companies.some((company) => company.slug === slug)) {
    throw new HttpError(400, 'Ese link ya está usado')
  }
  const adminUsername = cleanUsername(input.adminUsername)
  if (db.users.some((user) => user.username === adminUsername)) {
    throw new HttpError(400, 'Ese usuario ya existe')
  }
  return {
    id: id(),
    name,
    slug,
    tagline: cleanTagline(input.tagline),
    whatsapp: cleanPhone(input.whatsapp),
    currency: cleanCurrency(input.currency),
    adminUsername,
    adminPassword: cleanPassword(input.adminPassword, 'La clave del admin'),
    active: true
  }
}

export function insertCompany(input) {
  return update((db) => {
    if (db.companies.some((company) => company.slug === input.slug || company.id === input.id)) {
      throw new HttpError(400, 'Ese link ya está usado')
    }
    if (db.users.some((user) => user.username === input.adminUsername)) {
      throw new HttpError(400, 'Ese usuario ya existe')
    }
    const company = {
      id: input.id,
      name: input.name,
      slug: input.slug,
      logo: input.logo || '',
      tagline: input.tagline,
      whatsapp: input.whatsapp,
      currency: input.currency,
      active: true,
      createdAt: new Date().toISOString()
    }
    db.companies.push(company)
    db.users.push({
      id: id(),
      companyId: company.id,
      username: input.adminUsername,
      passwordHash: bcrypt.hashSync(input.adminPassword, 10),
      role: 'admin'
    })
    return presentCompany(db, company)
  })
}

export function updateCompany(companyId, patch) {
  return update((db) => {
    const company = mustCompany(db, companyId)
    if (patch.name != null) company.name = cleanName(patch.name, 'El nombre de la empresa')
    if (patch.slug != null) {
      const slug = cleanSlug(patch.slug)
      if (db.companies.some((item) => item.slug === slug && item.id !== company.id)) {
        throw new HttpError(400, 'Ese link ya está usado')
      }
      company.slug = slug
    }
    if (patch.tagline != null) company.tagline = cleanTagline(patch.tagline)
    if (patch.whatsapp != null) company.whatsapp = cleanPhone(patch.whatsapp)
    if (patch.currency != null) company.currency = cleanCurrency(patch.currency)
    if (patch.logo != null) company.logo = patch.logo
    if (patch.active != null) company.active = Boolean(patch.active)
    if (patch.adminUsername != null || patch.adminPassword) {
      const user = db.users.find((item) => item.companyId === company.id && item.role === 'admin')
      if (!user) throw new HttpError(400, 'Esa empresa no tiene admin')
      if (patch.adminUsername != null) {
        const username = cleanUsername(patch.adminUsername)
        if (db.users.some((item) => item.username === username && item.id !== user.id)) {
          throw new HttpError(400, 'Ese usuario ya existe')
        }
        user.username = username
      }
      if (patch.adminPassword) {
        user.passwordHash = bcrypt.hashSync(cleanPassword(patch.adminPassword, 'La clave del admin'), 10)
      }
    }
    return presentCompany(db, company)
  })
}

export function setCompanyActive(companyId, active) {
  return updateCompany(companyId, { active: Boolean(active) })
}

export function deleteCompany(companyId) {
  return update((db) => {
    const company = mustCompany(db, companyId)
    const files = [
      company.logo,
      ...db.products.filter((product) => product.companyId === companyId).map((product) => product.image)
    ].filter(Boolean)
    db.companies = db.companies.filter((item) => item.id !== companyId)
    db.users = db.users.filter((user) => user.companyId !== companyId)
    db.categories = db.categories.filter((category) => category.companyId !== companyId)
    db.products = db.products.filter((product) => product.companyId !== companyId)
    return { files }
  })
}

export function adminBundle(companyId) {
  const db = read()
  const company = mustCompany(db, companyId)
  return {
    company: presentCompany(db, company),
    categories: db.categories
      .filter((category) => category.companyId === companyId)
      .sort(bySort)
      .map((category) => ({ id: category.id, name: category.name, sort: category.sort })),
    products: db.products
      .filter((product) => product.companyId === companyId)
      .sort(bySort)
      .map(presentProduct)
  }
}

export function createCategory(companyId, name) {
  return update((db) => {
    mustCompany(db, companyId)
    const clean = cleanName(name, 'La categoría')
    if (clean.length > 40) throw new HttpError(400, 'La categoría es muy larga')
    const sort = db.categories.filter((category) => category.companyId === companyId).length
    const category = { id: id(), companyId, name: clean, sort }
    db.categories.push(category)
    return { id: category.id, name: category.name, sort: category.sort }
  })
}

export function renameCategory(companyId, categoryId, name) {
  return update((db) => {
    const category = mustCategory(db, companyId, categoryId)
    const clean = cleanName(name, 'La categoría')
    if (clean.length > 40) throw new HttpError(400, 'La categoría es muy larga')
    category.name = clean
    return { id: category.id, name: category.name, sort: category.sort }
  })
}

export function deleteCategory(companyId, categoryId) {
  return update((db) => {
    mustCategory(db, companyId, categoryId)
    const files = db.products
      .filter((product) => product.categoryId === categoryId)
      .map((product) => product.image)
      .filter(Boolean)
    db.products = db.products.filter((product) => product.categoryId !== categoryId)
    db.categories = db.categories.filter((category) => category.id !== categoryId)
    return { files }
  })
}

export function moveCategory(companyId, categoryId, dir) {
  return update((db) => {
    mustCategory(db, companyId, categoryId)
    const siblings = db.categories.filter((category) => category.companyId === companyId).sort(bySort)
    reorder(siblings, categoryId, dir)
    return { ok: true }
  })
}

export function createProduct(companyId, input) {
  return update((db) => {
    mustCompany(db, companyId)
    const category = mustCategory(db, companyId, input.categoryId)
    const product = {
      id: id(),
      companyId,
      categoryId: category.id,
      name: cleanProductName(input.name),
      description: cleanDescription(input.description),
      price: cleanPrice(input.price),
      image: input.image || '',
      sort: db.products.filter((item) => item.categoryId === category.id).length,
      visible: parseVisible(input.visible, true)
    }
    db.products.push(product)
    return { product: presentProduct(product), previousImage: '' }
  })
}

export function updateProduct(companyId, productId, input) {
  return update((db) => {
    const product = mustProduct(db, companyId, productId)
    const previousImage = product.image
    if (input.name != null) product.name = cleanProductName(input.name)
    if (input.description != null) product.description = cleanDescription(input.description)
    if (input.price != null) product.price = cleanPrice(input.price)
    if (input.visible != null) product.visible = parseVisible(input.visible, product.visible)
    if (input.image) product.image = input.image
    if (input.categoryId != null && input.categoryId !== product.categoryId) {
      const category = mustCategory(db, companyId, input.categoryId)
      product.categoryId = category.id
      product.sort = db.products.filter((item) => item.categoryId === category.id && item.id !== product.id).length
    }
    return { product: presentProduct(product), previousImage }
  })
}

export function deleteProduct(companyId, productId) {
  return update((db) => {
    const product = mustProduct(db, companyId, productId)
    db.products = db.products.filter((item) => item.id !== product.id)
    return { files: product.image ? [product.image] : [] }
  })
}

export function moveProduct(companyId, productId, dir) {
  return update((db) => {
    const product = mustProduct(db, companyId, productId)
    const siblings = db.products.filter((item) => item.categoryId === product.categoryId).sort(bySort)
    reorder(siblings, productId, dir)
    return { ok: true }
  })
}
