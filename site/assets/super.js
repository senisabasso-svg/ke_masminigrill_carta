import {
  changePassword,
  createCompany,
  getPublicBaseUrl,
  getSessionUser,
  listCompanies,
  login,
  logout,
  manageCompany,
  menuUrl,
  removeStoragePath,
  setPublicBaseUrl,
  uploadImage
} from './data.js'
import {
  confirmDialog,
  copyText,
  el,
  field,
  formatWhen,
  logoNode,
  openDialog,
  qrDataUrl,
  renderGate,
  slugify,
  toast
} from './shared.js'

const app = document.querySelector('#app')
let bootData = null
let session = null

function effectiveBase() {
  return (bootData.publicBaseUrl || bootData.origin).replace(/\/$/, '')
}

function isLocalHost(url) {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

async function boot() {
  session = await getSessionUser()
  if (!session) return renderLogin()
  if (session.role !== 'super') {
    app.replaceChildren(el('main', { class: 'missing-page' }, [
      el('p', { class: 'eyebrow' }, 'Superadmin'),
      el('h1', {}, 'Esta entrada es de la plataforma'),
      el('p', {}, 'El panel para editar la carta de un local está en otra puerta.'),
      el('a', { href: '/admin/' }, 'Ir al panel del local')
    ]))
    return
  }
  await refresh()
}

async function refresh() {
  const [companies, publicBaseUrl] = await Promise.all([listCompanies(), getPublicBaseUrl()])
  bootData = {
    companies,
    publicBaseUrl,
    origin: location.origin
  }
  renderApp()
}

function renderLogin(message = '') {
  const error = el('p', { class: 'err', role: 'alert' }, message)
  const form = el('form', { class: 'form-card' }, [
    el('h2', {}, 'Ingresar'),
    field('Email o usuario', el('input', { name: 'login', autocomplete: 'username', required: true }), 'Ej: superadmin o superadmin@carta.local'),
    field('Clave', el('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    error,
    el('button', { class: 'btn', type: 'submit' }, 'Entrar'),
    el('a', { class: 'back-link', href: '/' }, 'Volver al inicio')
  ])
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button')
    button.disabled = true
    error.textContent = ''
    try {
      const payload = Object.fromEntries(new FormData(form))
      session = await login(payload.login, payload.password)
      if (!session || session.role !== 'super') {
        await logout()
        session = null
        error.textContent = 'Esa cuenta es de un local. Entrá por el panel del local.'
        button.disabled = false
        return
      }
      await refresh()
    } catch (err) {
      error.textContent = err.message
      button.disabled = false
    }
  })
  app.replaceChildren(renderGate({
    kicker: 'Plataforma',
    lede: 'Das de alta cada empresa, con su nombre, su logo y un admin. Al crearla queda el link y el QR.',
    form
  }))
}

function renderApp() {
  const base = effectiveBase()
  const banner = isLocalHost(base)
    ? el('p', { class: 'banner' }, 'Los QR están apuntando a esta computadora o falta la dirección pública. Poné abajo la URL de Cloudflare Pages, por ejemplo https://tu-carta.pages.dev')
    : null

  const urlError = el('p', { class: 'err', role: 'alert' })
  const urlForm = el('form', { class: 'stack' }, [
    field('Dirección pública', el('input', {
      name: 'publicBaseUrl',
      value: bootData.publicBaseUrl || '',
      placeholder: bootData.origin
    }), 'Esta dirección se imprime dentro de cada QR. Sin barra al final.'),
    urlError,
    el('button', { class: 'btn secondary', type: 'submit' }, 'Guardar dirección')
  ])
  urlForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    urlError.textContent = ''
    try {
      let value = String(Object.fromEntries(new FormData(urlForm)).publicBaseUrl || '').trim()
      if (value) {
        const url = new URL(value)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('La dirección tiene que empezar con http:// o https://')
        value = url.origin
      }
      await setPublicBaseUrl(value)
      toast('Dirección guardada. Los QR nuevos usan esa dirección.')
      await refresh()
    } catch (err) {
      urlError.textContent = err.message
    }
  })

  const list = el('div', { class: 'list' })
  if (!bootData.companies.length) {
    list.append(el('p', { class: 'meta' }, 'Todavía no hay empresas. Creá la primera y se genera su QR.'))
  }
  bootData.companies.forEach((company) => list.append(companyRow(company)))

  const passError = el('p', { class: 'err', role: 'alert' })
  const pass = el('form', { class: 'stack' }, [
    field('Clave nueva', el('input', { name: 'next', type: 'password', autocomplete: 'new-password', required: true, minlength: '6' })),
    passError,
    el('button', { class: 'btn secondary', type: 'submit' }, 'Cambiar mi clave')
  ])
  pass.addEventListener('submit', async (event) => {
    event.preventDefault()
    passError.textContent = ''
    try {
      await changePassword(Object.fromEntries(new FormData(pass)).next)
      pass.reset()
      toast('Clave actualizada')
    } catch (err) {
      passError.textContent = err.message
    }
  })

  app.replaceChildren(el('main', { class: 'main' }, [
    el('header', { class: 'top' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow' }, 'Superadmin'),
        el('h1', {}, 'Empresas')
      ]),
      el('div', { class: 'row-actions' }, [
        el('button', { type: 'button', class: 'btn', onclick: openCreate }, 'Nueva empresa'),
        el('button', { type: 'button', class: 'btn secondary', onclick: doLogout }, 'Salir')
      ])
    ]),
    banner,
    el('section', { class: 'block' }, [urlForm]),
    el('section', { class: 'block' }, [
      el('h2', {}, 'Locales dados de alta'),
      list
    ]),
    el('section', { class: 'block' }, [
      el('h2', {}, 'Tu clave'),
      pass
    ])
  ]))
}

function companyRow(company) {
  const link = menuUrl(effectiveBase(), company.slug)
  return el('article', { class: 'co' }, [
    logoNode(company.logo, company.name, 'logo sm'),
    el('div', {}, [
      el('strong', {}, company.name),
      company.active ? null : el('span', { class: 'badge' }, 'Pausada'),
      el('div', { class: 'meta' }, `Admin: ${company.adminUsername} · ${company.categoryCount} categorías · ${company.productCount} productos`),
      el('div', { class: 'meta' }, link),
      el('div', { class: 'meta' }, formatWhen(company.createdAt) ? `Alta ${formatWhen(company.createdAt)}` : '')
    ]),
    el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'btn small', onclick: () => showQr(company, link) }, 'Ver QR'),
      el('a', { class: 'btn secondary small', href: `/c/${company.slug}`, target: '_blank', rel: 'noopener' }, 'Abrir carta'),
      el('button', { type: 'button', class: 'btn secondary small', onclick: () => openEdit(company) }, 'Editar'),
      el('button', { type: 'button', class: 'btn secondary small', onclick: () => toggleActive(company) }, company.active ? 'Pausar' : 'Activar'),
      el('button', { type: 'button', class: 'btn danger small', onclick: () => removeCompany(company) }, 'Borrar')
    ])
  ])
}

function showQr(company, link) {
  const img = el('img', { alt: `QR de ${company.name}`, width: '280', height: '280' })
  qrDataUrl(link).then((url) => { img.src = url })
  const body = el('div', { class: 'sheet-body' }, [
    el('p', { class: 'eyebrow' }, 'Código QR'),
    el('h2', {}, company.name),
    el('div', { class: 'qr-frame' }, [img]),
    el('p', {}, 'Al escanearlo se abre la carta online de este local.'),
    field('Link', el('input', { value: link, readonly: true })),
    el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: async () => { await copyText(link); toast('Link copiado') } }, 'Copiar link'),
      el('a', { class: 'btn secondary', href: `/imprimir/?slug=${encodeURIComponent(company.slug)}`, target: '_blank', rel: 'noopener' }, 'Imprimir lámina'),
      el('button', { type: 'button', class: 'btn secondary', onclick: () => dialog.close() }, 'Cerrar')
    ])
  ])
  const dialog = openDialog(body)
}

function openCreate() {
  const error = el('p', { class: 'err', role: 'alert' })
  const name = el('input', { name: 'name', required: true, maxlength: '60' })
  const slug = el('input', { name: 'slug', maxlength: '48' })
  let slugTouched = false
  const preview = el('p', { class: 'help' })
  const refreshPreview = () => {
    const value = slugify(slug.value || name.value)
    preview.textContent = value ? `${effectiveBase()}/c/${value}` : 'El link se arma con el nombre.'
  }
  name.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(name.value)
    refreshPreview()
  })
  slug.addEventListener('input', () => {
    slugTouched = true
    slug.value = slugify(slug.value)
    refreshPreview()
  })
  refreshPreview()
  const logoPreview = el('div', {})
  const logo = el('input', { name: 'logo', type: 'file', accept: 'image/jpeg,image/png,image/webp' })
  logo.addEventListener('change', () => {
    const file = logo.files?.[0]
    if (!file) return logoPreview.replaceChildren()
    const img = el('img', { class: 'preview', alt: '' })
    img.src = URL.createObjectURL(file)
    logoPreview.replaceChildren(img)
  })
  const form = el('form', { class: 'sheet-body' }, [
    el('h2', {}, 'Nueva empresa'),
    field('Nombre de la empresa', name),
    field('Identificador del link', slug, 'Solo letras, números y guiones.'),
    preview,
    field('Logo', logo, 'Opcional. Si no hay logo, la carta muestra las iniciales.'),
    logoPreview,
    field('Usuario admin', el('input', { name: 'adminUsername', required: true, autocomplete: 'off', maxlength: '24' }), 'Con este usuario entra el local. Email: usuario@carta.local'),
    field('Clave admin', el('input', { name: 'adminPassword', type: 'password', required: true, minlength: '6', autocomplete: 'new-password' })),
    field('Frase', el('input', { name: 'tagline', maxlength: '80' })),
    field('WhatsApp', el('input', { name: 'whatsapp', placeholder: '099 123 456' })),
    field('Moneda', el('input', { name: 'currency', value: '$', maxlength: '6' })),
    error,
    el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn', type: 'submit' }, 'Crear empresa y generar QR'),
      el('button', { class: 'btn secondary', type: 'button', onclick: () => dialog.close() }, 'Cancelar')
    ])
  ])
  const dialog = openDialog(form)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button[type="submit"]')
    button.disabled = true
    error.textContent = ''
    const body = Object.fromEntries(new FormData(form))
    try {
      const result = await createCompany({
        name: body.name,
        slug: body.slug,
        tagline: body.tagline,
        whatsapp: body.whatsapp,
        currency: body.currency,
        adminUsername: body.adminUsername,
        adminPassword: body.adminPassword
      })

      if (logo.files?.[0] && result.company?.id) {
        const logoPath = await uploadImage(result.company.id, logo.files[0])
        await manageCompany({
          action: 'update',
          companyId: result.company.id,
          logo_path: logoPath
        })
      }

      await refresh()
      dialog.close()
      toast('Empresa creada')
      const link = menuUrl(effectiveBase(), result.company.slug)
      showQr(result.company, link)
    } catch (err) {
      error.textContent = err.message
      button.disabled = false
    }
  })
}

function openEdit(company) {
  const error = el('p', { class: 'err', role: 'alert' })
  const logoPreview = el('div', {})
  if (company.logo) logoPreview.append(el('img', { class: 'preview', alt: '', src: company.logo }))
  const logo = el('input', { name: 'logo', type: 'file', accept: 'image/jpeg,image/png,image/webp' })
  logo.addEventListener('change', () => {
    const file = logo.files?.[0]
    if (!file) return
    const img = el('img', { class: 'preview', alt: '' })
    img.src = URL.createObjectURL(file)
    logoPreview.replaceChildren(img)
  })
  const form = el('form', { class: 'sheet-body' }, [
    el('h2', {}, 'Editar empresa'),
    field('Nombre', el('input', { name: 'name', required: true, maxlength: '60', value: company.name })),
    field('Identificador del link', el('input', { name: 'slug', required: true, maxlength: '48', value: company.slug }), 'Si lo cambiás, el QR anterior deja de servir.'),
    field('Usuario admin', el('input', { name: 'adminUsername', required: true, maxlength: '24', value: company.adminUsername })),
    field('Nueva clave admin', el('input', { name: 'adminPassword', type: 'password', minlength: '6', autocomplete: 'new-password' }), 'Dejala vacía para no cambiarla.'),
    field('Frase', el('input', { name: 'tagline', maxlength: '80', value: company.tagline || '' })),
    field('WhatsApp', el('input', { name: 'whatsapp', value: company.whatsapp || '' })),
    field('Moneda', el('input', { name: 'currency', maxlength: '6', value: company.currency || '$' })),
    field('Logo', logo),
    logoPreview,
    el('label', { class: 'check' }, [
      el('input', { type: 'checkbox', name: 'active', checked: company.active }),
      'Carta activa'
    ]),
    error,
    el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn', type: 'submit' }, 'Guardar'),
      el('button', { class: 'btn secondary', type: 'button', onclick: () => dialog.close() }, 'Cancelar')
    ])
  ])
  const dialog = openDialog(form)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button[type="submit"]')
    button.disabled = true
    error.textContent = ''
    const body = Object.fromEntries(new FormData(form))
    try {
      let logoPath = company.logoPath || ''
      if (logo.files?.[0]) {
        const uploaded = await uploadImage(company.id, logo.files[0])
        if (logoPath) await removeStoragePath(logoPath)
        logoPath = uploaded
      }
      await manageCompany({
        action: 'update',
        companyId: company.id,
        name: body.name,
        slug: body.slug,
        tagline: body.tagline,
        whatsapp: body.whatsapp,
        currency: body.currency,
        adminUsername: body.adminUsername,
        adminPassword: body.adminPassword || undefined,
        logo_path: logoPath,
        active: form.elements.active.checked
      })
      dialog.close()
      toast('Empresa actualizada')
      await refresh()
    } catch (err) {
      error.textContent = err.message
      button.disabled = false
    }
  })
}

async function toggleActive(company) {
  await manageCompany({
    action: 'update',
    companyId: company.id,
    active: !company.active
  })
  toast(company.active ? 'Carta pausada' : 'Carta activa')
  await refresh()
}

async function removeCompany(company) {
  const ok = await confirmDialog(
    'Borrar empresa',
    `Se borra ${company.name}, su admin, las categorías y los productos. El QR deja de funcionar.`
  )
  if (!ok) return
  await manageCompany({ action: 'delete', companyId: company.id })
  toast('Empresa borrada')
  await refresh()
}

async function doLogout() {
  await logout()
  session = null
  bootData = null
  renderLogin()
}

boot().catch((error) => {
  app.replaceChildren(el('main', { class: 'missing-page' }, [
    el('h1', {}, 'No se pudo abrir el superadmin'),
    el('p', {}, error.message)
  ]))
})
