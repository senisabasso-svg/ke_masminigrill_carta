import {
  api,
  confirmDialog,
  copyText,
  el,
  field,
  formatWhen,
  logoNode,
  openDialog,
  renderGate,
  slugify,
  toast
} from './shared.js'

const app = document.querySelector('#app')
let bootData = null

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
  const me = await api('/api/auth/me')
  if (!me.user) return renderLogin()
  if (me.user.role !== 'super') {
    app.replaceChildren(el('main', { class: 'missing-page' }, [
      el('p', { class: 'eyebrow' }, 'Superadmin'),
      el('h1', {}, 'Esta entrada es de la plataforma'),
      el('p', {}, 'El panel para editar la carta de un local está en otra puerta.'),
      el('a', { href: '/admin' }, 'Ir al panel del local')
    ]))
    return
  }
  await refresh()
}

async function refresh() {
  bootData = await api('/api/super/bootstrap')
  renderApp()
}

function renderLogin(message = '') {
  const error = el('p', { class: 'err', role: 'alert' }, message)
  const form = el('form', { class: 'form-card' }, [
    el('h2', {}, 'Ingresar'),
    field('Usuario', el('input', { name: 'username', autocomplete: 'username', required: true })),
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
      const result = await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) })
      if (result.user.role !== 'super') {
        await api('/api/auth/logout', { method: 'POST', body: {} })
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
    ? el('p', { class: 'banner' }, 'Los QR están apuntando a esta computadora. Un celular no va a poder abrirlos. Poné abajo la dirección real, por ejemplo http://192.168.1.20:3000 o el dominio del servidor.')
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
      await api('/api/super/settings', { method: 'POST', body: Object.fromEntries(new FormData(urlForm)) })
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
    field('Clave actual', el('input', { name: 'current', type: 'password', autocomplete: 'current-password', required: true })),
    field('Clave nueva', el('input', { name: 'next', type: 'password', autocomplete: 'new-password', required: true, minlength: '6' })),
    passError,
    el('button', { class: 'btn secondary', type: 'submit' }, 'Cambiar mi clave')
  ])
  pass.addEventListener('submit', async (event) => {
    event.preventDefault()
    passError.textContent = ''
    try {
      await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(pass)) })
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
        el('button', { type: 'button', class: 'btn secondary', onclick: logout }, 'Salir')
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
  const link = `${effectiveBase()}/c/${company.slug}`
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
  const body = el('div', { class: 'sheet-body' }, [
    el('p', { class: 'eyebrow' }, 'Código QR'),
    el('h2', {}, company.name),
    el('div', { class: 'qr-frame' }, [
      el('img', { src: `/api/public/${company.slug}/qr.png?v=${Date.now()}`, alt: `QR de ${company.name}`, width: '280', height: '280' })
    ]),
    el('p', {}, 'Al escanearlo se abre la carta online de este local.'),
    field('Link', el('input', { value: link, readonly: true })),
    el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: async () => { await copyText(link); toast('Link copiado') } }, 'Copiar link'),
      el('a', { class: 'btn secondary', href: `/api/public/${company.slug}/qr.png?download=1` }, 'Descargar PNG'),
      el('a', { class: 'btn secondary', href: `/imprimir/${company.slug}`, target: '_blank', rel: 'noopener' }, 'Imprimir lámina'),
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
    field('Usuario admin', el('input', { name: 'adminUsername', required: true, autocomplete: 'off', maxlength: '24' }), 'Con este usuario entra el local a editar su carta.'),
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
    const body = new FormData(form)
    if (!logo.files?.length) body.delete('logo')
    try {
      const result = await api('/api/super/companies', { method: 'POST', body })
      await refresh()
      dialog.close()
      toast('Empresa creada')
      showQr(result.company, result.publicUrl)
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
    const body = new FormData(form)
    body.set('active', form.elements.active.checked ? 'true' : 'false')
    if (!form.elements.adminPassword.value) body.delete('adminPassword')
    if (!logo.files?.length) body.delete('logo')
    try {
      await api(`/api/super/companies/${company.id}`, { method: 'PATCH', body })
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
  await api(`/api/super/companies/${company.id}/active`, {
    method: 'POST',
    body: { active: !company.active }
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
  await api(`/api/super/companies/${company.id}`, { method: 'DELETE' })
  toast('Empresa borrada')
  await refresh()
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST', body: {} })
  bootData = null
  renderLogin()
}

boot().catch((error) => {
  app.replaceChildren(el('main', { class: 'missing-page' }, [
    el('h1', {}, 'No se pudo abrir el superadmin'),
    el('p', {}, error.message)
  ]))
})
