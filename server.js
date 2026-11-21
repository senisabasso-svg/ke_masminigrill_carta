import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import session from 'express-session'
import multer from 'multer'
import QRCode from 'qrcode'
import {
  HttpError,
  adminBundle,
  assertNewCompany,
  authenticate,
  changePassword,
  createCategory,
  createProduct,
  dataDir,
  deleteCategory,
  deleteCompany,
  deleteProduct,
  ensure,
  getCompanyBySlug,
  getPublicMenu,
  getSettings,
  insertCompany,
  listCompanies,
  moveCategory,
  moveProduct,
  renameCategory,
  rootDir,
  setCompanyActive,
  setPublicBaseUrl,
  updateCompany,
  updateProduct,
  uploadsDir
} from './lib/store.js'

ensure()

const pagesDir = path.join(rootDir, 'pages')
const publicDir = path.join(rootDir, 'public')
const port = Number(process.env.PORT) || 3000

function sessionSecret() {
  const file = path.join(dataDir, 'session.secret')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'))
  return fs.readFileSync(file, 'utf8').trim()
}

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(session({
  name: 'carta.sid',
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}))

app.use('/uploads', express.static(uploadsDir, { index: false, fallthrough: false }))
app.use(express.static(publicDir, { index: false }))

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

function isId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function requireId(req, res, next) {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' })
  next()
}

function requireRole(role) {
  return (req, res, next) => {
    const user = req.session.user
    if (!user) return res.status(401).json({ error: 'Tenés que ingresar' })
    if (role && user.role !== role) return res.status(403).json({ error: 'No tenés permiso para esto' })
    next()
  }
}

function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const origin = req.get('origin')
  if (!origin) return next()
  const expected = `${req.protocol}://${req.get('host')}`
  if (origin !== expected) return res.status(403).json({ error: 'Origen no permitido' })
  next()
}

app.use('/api', sameOrigin)

function baseUrl(req) {
  const configured = getSettings().publicBaseUrl
  if (configured) return configured.replace(/\/$/, '')
  return `${req.protocol}://${req.get('host')}`
}

function menuUrl(req, slug) {
  return `${baseUrl(req)}/c/${slug}`
}

function page(file) {
  return (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.sendFile(path.join(pagesDir, file))
  }
}

function extFor(mime) {
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return ''
}

function rejectFile(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const folder = req.companyUploadId || '_incoming'
      const dir = path.join(uploadsDir, folder)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename(_req, file, cb) {
      cb(null, `${crypto.randomUUID()}${extFor(file.mimetype)}`)
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!extFor(file.mimetype)) cb(rejectFile('Usá una foto JPG, PNG o WEBP'))
    else cb(null, true)
  }
})

function publicUploadPath(absPath) {
  const relative = path.relative(uploadsDir, absPath).split(path.sep).join('/')
  return `/uploads/${relative}`
}

function moveIntoCompany(absFile, companyId) {
  const dir = path.join(uploadsDir, companyId)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, path.basename(absFile))
  fs.renameSync(absFile, dest)
  return publicUploadPath(dest)
}

function safeUnlink(publicPath) {
  if (!publicPath || typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return
  const root = path.resolve(uploadsDir)
  const abs = path.resolve(root, publicPath.slice('/uploads/'.length))
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return
  fs.rmSync(abs, { force: true })
}

function unlinkAll(files) {
  for (const file of files || []) safeUnlink(file)
}

function stampCompany(req, _res, next) {
  req.companyUploadId = req.session.user.companyId
  next()
}

function parseDir(value) {
  const dir = Number(value)
  if (dir !== -1 && dir !== 1) throw new HttpError(400, 'No se pudo reordenar')
  return dir
}

function cleanBaseUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  let url
  try {
    url = new URL(text)
  } catch {
    throw new HttpError(400, 'La dirección pública tiene que empezar con http:// o https://')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'La dirección pública tiene que empezar con http:// o https://')
  }
  return url.origin
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]))
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'C'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const failures = new Map()

function assertRate(req) {
  const record = failures.get(req.ip)
  if (record && record.count >= 12 && Date.now() - record.at < 15 * 60 * 1000) {
    throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.')
  }
}

function registerFailure(req) {
  const now = Date.now()
  const record = failures.get(req.ip) || { count: 0, at: now }
  if (now - record.at > 15 * 60 * 1000) {
    record.count = 0
    record.at = now
  }
  record.count += 1
  failures.set(req.ip, record)
}

function clearFailure(req) {
  failures.delete(req.ip)
}

app.get('/api/auth/me', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ user: req.session.user || null })
})

app.post('/api/auth/login', wrap(async (req, res) => {
  assertRate(req)
  let account
  try {
    account = authenticate(req.body?.username, req.body?.password)
  } catch (error) {
    if (error.status === 401) registerFailure(req)
    throw error
  }
  clearFailure(req)
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  })
  req.session.user = account
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()))
  })
  res.json({ user: account })
}))

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('carta.sid')
    res.json({ ok: true })
  })
})

app.post('/api/auth/password', requireRole(), wrap(async (req, res) => {
  await changePassword(req.session.user.id, req.body?.current, req.body?.next)
  res.json({ ok: true })
}))

app.get('/api/public/:slug', wrap((req, res) => {
  res.set('Cache-Control', 'no-store')
  const menu = getPublicMenu(req.params.slug)
  if (!menu) return res.status(404).json({ error: 'Esta carta no está disponible' })
  res.json(menu)
}))

app.get('/api/public/:slug/qr.png', wrap(async (req, res) => {
  const company = getCompanyBySlug(req.params.slug)
  if (!company) return res.status(404).json({ error: 'Esta carta no está disponible' })
  const png = await QRCode.toBuffer(menuUrl(req, company.slug), {
    width: 900,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1e1a16', light: '#f4efe6' }
  })
  res.set('Content-Type', 'image/png')
  res.set('Cache-Control', 'no-store')
  if (req.query.download) {
    res.set('Content-Disposition', `attachment; filename="qr-${company.slug}.png"`)
  }
  res.send(png)
}))

app.get('/api/super/bootstrap', requireRole('super'), wrap((req, res) => {
  res.set('Cache-Control', 'no-store')
  const settings = getSettings()
  const origin = `${req.protocol}://${req.get('host')}`
  res.json({
    companies: listCompanies(),
    publicBaseUrl: settings.publicBaseUrl,
    origin
  })
}))

app.post('/api/super/settings', requireRole('super'), wrap(async (req, res) => {
  const publicBaseUrl = cleanBaseUrl(req.body?.publicBaseUrl)
  await setPublicBaseUrl(publicBaseUrl)
  res.json({ publicBaseUrl, origin: `${req.protocol}://${req.get('host')}` })
}))

app.post('/api/super/companies', requireRole('super'), (req, res, next) => {
  req.companyUploadId = '_incoming'
  next()
}, upload.single('logo'), wrap(async (req, res) => {
  let logo = ''
  try {
    const draft = assertNewCompany(req.body || {})
    if (req.file) logo = moveIntoCompany(req.file.path, draft.id)
    const company = await insertCompany({ ...draft, logo })
    res.json({ company, publicUrl: menuUrl(req, company.slug) })
  } catch (error) {
    if (req.file && !logo) fs.rmSync(req.file.path, { force: true })
    if (logo) safeUnlink(logo)
    throw error
  }
}))

app.patch('/api/super/companies/:id', requireRole('super'), requireId, (req, res, next) => {
  req.companyUploadId = req.params.id
  next()
}, upload.single('logo'), wrap(async (req, res) => {
  const body = req.body || {}
  const current = getCompanyBySlugFromId(req.params.id)
  if (!current) throw new HttpError(404, 'No está esa empresa')
  const patch = {
    name: body.name,
    slug: body.slug,
    tagline: body.tagline,
    whatsapp: body.whatsapp,
    currency: body.currency,
    adminUsername: body.adminUsername,
    active: !(body.active === 'false' || body.active === '0' || body.active === false)
  }
  if (body.adminPassword) patch.adminPassword = body.adminPassword
  if (req.file) patch.logo = publicUploadPath(req.file.path)
  try {
    const company = await updateCompany(req.params.id, patch)
    if (req.file && current.logo && current.logo !== company.logo) safeUnlink(current.logo)
    res.json({ company, publicUrl: menuUrl(req, company.slug) })
  } catch (error) {
    if (req.file) fs.rmSync(req.file.path, { force: true })
    throw error
  }
}))

function getCompanyBySlugFromId(companyId) {
  return listCompanies().find((company) => company.id === companyId) || null
}

app.post('/api/super/companies/:id/active', requireRole('super'), requireId, wrap(async (req, res) => {
  const company = await setCompanyActive(req.params.id, req.body?.active)
  res.json({ company, publicUrl: menuUrl(req, company.slug) })
}))

app.delete('/api/super/companies/:id', requireRole('super'), requireId, wrap(async (req, res) => {
  const result = await deleteCompany(req.params.id)
  unlinkAll(result.files)
  fs.rmSync(path.join(uploadsDir, req.params.id), { recursive: true, force: true })
  res.json({ ok: true })
}))

app.get('/api/admin/bootstrap', requireRole('admin'), wrap((req, res) => {
  res.set('Cache-Control', 'no-store')
  const bundle = adminBundle(req.session.user.companyId)
  res.json({ ...bundle, publicUrl: menuUrl(req, bundle.company.slug) })
}))

app.patch('/api/admin/company', requireRole('admin'), stampCompany, upload.single('logo'), wrap(async (req, res) => {
  const current = adminBundle(req.session.user.companyId).company
  const body = req.body || {}
  const patch = {
    name: body.name,
    tagline: body.tagline,
    whatsapp: body.whatsapp,
    currency: body.currency
  }
  if (req.file) patch.logo = publicUploadPath(req.file.path)
  try {
    const company = await updateCompany(req.session.user.companyId, patch)
    if (req.file && current.logo && current.logo !== company.logo) safeUnlink(current.logo)
    res.json({ company })
  } catch (error) {
    if (req.file) fs.rmSync(req.file.path, { force: true })
    throw error
  }
}))

app.post('/api/admin/categories', requireRole('admin'), wrap(async (req, res) => {
  res.json(await createCategory(req.session.user.companyId, req.body?.name))
}))

app.patch('/api/admin/categories/:id', requireRole('admin'), requireId, wrap(async (req, res) => {
  res.json(await renameCategory(req.session.user.companyId, req.params.id, req.body?.name))
}))

app.delete('/api/admin/categories/:id', requireRole('admin'), requireId, wrap(async (req, res) => {
  const result = await deleteCategory(req.session.user.companyId, req.params.id)
  unlinkAll(result.files)
  res.json({ ok: true })
}))

app.post('/api/admin/categories/:id/move', requireRole('admin'), requireId, wrap(async (req, res) => {
  await moveCategory(req.session.user.companyId, req.params.id, parseDir(req.body?.dir))
  res.json({ ok: true })
}))

app.post('/api/admin/products', requireRole('admin'), stampCompany, upload.single('image'), wrap(async (req, res) => {
  const image = req.file ? publicUploadPath(req.file.path) : ''
  try {
    const result = await createProduct(req.session.user.companyId, { ...(req.body || {}), image })
    res.json(result.product)
  } catch (error) {
    if (image) safeUnlink(image)
    throw error
  }
}))

app.patch('/api/admin/products/:id', requireRole('admin'), requireId, stampCompany, upload.single('image'), wrap(async (req, res) => {
  const image = req.file ? publicUploadPath(req.file.path) : ''
  try {
    const result = await updateProduct(req.session.user.companyId, req.params.id, {
      ...(req.body || {}),
      image: image || undefined
    })
    if (image && result.previousImage && result.previousImage !== image) safeUnlink(result.previousImage)
    res.json(result.product)
  } catch (error) {
    if (image) safeUnlink(image)
    throw error
  }
}))

app.delete('/api/admin/products/:id', requireRole('admin'), requireId, wrap(async (req, res) => {
  const result = await deleteProduct(req.session.user.companyId, req.params.id)
  unlinkAll(result.files)
  res.json({ ok: true })
}))

app.post('/api/admin/products/:id/move', requireRole('admin'), requireId, wrap(async (req, res) => {
  await moveProduct(req.session.user.companyId, req.params.id, parseDir(req.body?.dir))
  res.json({ ok: true })
}))

app.get('/', page('home.html'))
app.get('/admin', page('admin.html'))
app.get('/super', page('super.html'))
app.get('/c/:slug', page('menu.html'))

app.get('/imprimir/:slug', wrap((req, res) => {
  const company = getCompanyBySlug(req.params.slug)
  if (!company) return res.status(404).type('html').send(notFoundHtml())
  const url = menuUrl(req, company.slug)
  const mark = company.logo
    ? `<img class="mark" src="${esc(company.logo)}" alt="">`
    : `<div class="mark mono">${esc(initials(company.name))}</div>`
  res.set('Cache-Control', 'no-store')
  res.type('html').send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR · ${esc(company.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e7e0d4; color: #1e1a16; font-family: Outfit, "Segoe UI", sans-serif; }
    .card { width: min(440px, calc(100% - 32px)); margin: 28px auto; background: #f4efe6; padding: 36px 28px 24px; text-align: center; }
    .mark { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; margin: 0 auto 12px; }
    .mono { display: grid; place-items: center; background: #1e1a16; color: #f4efe6; font-weight: 600; }
    .kicker { margin: 0; letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.74rem; font-weight: 600; color: #8d3018; }
    h1 { font-family: Fraunces, Palatino, serif; font-weight: 520; letter-spacing: -0.04em; font-size: 2.6rem; line-height: 0.95; margin: 8px 0 18px; }
    .qr { width: min(280px, 100%); height: auto; }
    p { margin: 10px 0 0; }
    .url { color: #5c534a; font-size: 0.88rem; word-break: break-all; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
    a, button { font: inherit; font-weight: 600; text-decoration: none; color: #1e1a16; background: transparent; border: 1px solid #ddd4c6; border-radius: 999px; padding: 10px 14px; }
    button { background: #1e1a16; color: #f4efe6; border-color: #1e1a16; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .card { margin: 0 auto; }
      .actions { display: none; }
    }
    @page { margin: 14mm; }
  </style>
</head>
<body>
  <article class="card">
    ${mark}
    <p class="kicker">Carta online</p>
    <h1>${esc(company.name)}</h1>
    <img class="qr" src="/api/public/${esc(company.slug)}/qr.png" alt="Código QR de ${esc(company.name)}">
    <p>Escaneá para ver la carta</p>
    <p class="url">${esc(url)}</p>
    <div class="actions">
      <button type="button" onclick="print()">Imprimir</button>
      <a href="/api/public/${esc(company.slug)}/qr.png?download=1">Descargar PNG</a>
      <a href="/super">Volver</a>
    </div>
  </article>
</body>
</html>`)
}))

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'No encontrado' })
})

app.use((_req, res) => {
  res.status(404).type('html').send(notFoundHtml())
})

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>No encontrada</title>
  <link rel="stylesheet" href="/assets/tokens.css">
  <link rel="stylesheet" href="/assets/panel.css">
</head>
<body>
  <main class="missing-page">
    <p class="eyebrow">Carta</p>
    <h1>Esa página no está.</h1>
    <p><a href="/">Volver al inicio</a></p>
  </main>
</body>
</html>`
}

app.use((error, _req, res, _next) => {
  const status = error.status || (error instanceof multer.MulterError ? 400 : 500)
  if (status >= 500) console.error(error)
  let message = 'No se pudo completar la acción'
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    message = 'La imagen supera el tamaño permitido (5 MB)'
  } else if (status < 500 && error.message) {
    message = error.message
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El pedido no se pudo leer' })
  }
  res.status(status).json({ error: message })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Carta lista en http://localhost:${port}`)
  console.log(`Superadmin: http://localhost:${port}/super`)
  console.log(`Panel del local: http://localhost:${port}/admin`)
})
