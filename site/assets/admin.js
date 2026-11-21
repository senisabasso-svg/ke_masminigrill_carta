import {
  adminBundle,
  changePassword,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getSessionUser,
  login,
  logout,
  moveCategory,
  moveProduct,
  removeStoragePath,
  renameCategory,
  updateCompanyLocal,
  updateProduct,
  uploadImage
} from './data.js'
import {
  confirmDialog,
  copyText,
  el,
  field,
  formatWhen,
  money,
  openDialog,
  qrDataUrl,
  renderGate,
  toast
} from './shared.js'

const app = document.querySelector('#app')
let tab = 'productos'
let data = null
let session = null

async function boot() {
  session = await getSessionUser()
  if (!session) return renderLogin()
  if (session.role !== 'admin') return renderWrong()
  await refresh()
}

async function refresh() {
  data = await adminBundle(session.companyId)
  renderApp()
}

function renderLogin(message = '') {
  const error = el('p', { class: 'err', role: 'alert' }, message)
  const form = el('form', { class: 'form-card' }, [
    el('h2', {}, 'Ingresar'),
    field('Email o usuario', el('input', { name: 'login', autocomplete: 'username', required: true }), 'Si usás solo el usuario, se completa como usuario@carta.local'),
    field('Clave', el('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    error,
    el('button', { class: 'btn', type: 'submit' }, 'Entrar al local'),
    el('a', { class: 'back-link', href: '/' }, 'Volver al inicio')
  ])
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button')
    button.disabled = true
    error.textContent = ''
    const payload = Object.fromEntries(new FormData(form))
    try {
      session = await login(payload.login, payload.password)
      if (!session || session.role !== 'admin') {
        await logout()
        session = null
        error.textContent = 'Esa cuenta es del superadmin. Entrá por la plataforma.'
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
    kicker: 'Local',
    lede: 'Entrá para cambiar categorías, nombres, precios y fotos de tu carta.',
    form
  }))
}

function renderWrong() {
  app.replaceChildren(el('main', { class: 'missing-page' }, [
    el('p', { class: 'eyebrow' }, 'Local'),
    el('h1', {}, 'Esta entrada es del local'),
    el('p', {}, 'Las empresas nuevas se dan de alta en el superadmin.'),
    el('a', { href: '/super/' }, 'Ir al superadmin')
  ]))
}

function renderApp() {
  const nav = (id, label) => el('button', {
    type: 'button',
    class: 'nav-btn',
    'aria-current': tab === id ? 'page' : null,
    onclick: () => { tab = id; renderApp() }
  }, label)

  const views = {
    productos: viewProducts,
    categorias: viewCategories,
    empresa: viewCompany,
    qr: viewQr
  }

  app.replaceChildren(el('div', { class: 'shell' }, [
    el('nav', { class: 'side', 'aria-label': 'Secciones del panel' }, [
      el('p', {}, data.company.name),
      nav('productos', 'Productos'),
      nav('categorias', 'Categorías'),
      nav('empresa', 'Empresa'),
      nav('qr', 'Código QR')
    ]),
    el('div', { class: 'main' }, [
      el('header', { class: 'top' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, 'Panel del local'),
          el('h1', {}, data.company.name)
        ]),
        el('div', { class: 'row-actions' }, [
          el('a', { class: 'btn secondary', href: `/c/${data.company.slug}`, target: '_blank', rel: 'noopener' }, 'Ver carta'),
          el('button', { type: 'button', class: 'btn secondary', onclick: doLogout }, 'Salir')
        ])
      ]),
      views[tab]()
    ])
  ]))
}

async function doLogout() {
  await logout()
  session = null
  data = null
  renderLogin()
}

function viewProducts() {
  const categories = data.categories
  const root = el('section', { class: 'block' }, [
    el('div', { class: 'top' }, [
      el('h2', {}, 'Productos'),
      categories.length
        ? el('button', { type: 'button', class: 'btn', onclick: () => openProduct() }, 'Nuevo producto')
        : null
    ])
  ])
  if (!categories.length) {
    root.append(el('p', { class: 'meta' }, 'Primero creá una categoría. Después vas a poder cargar platos.'))
    root.append(el('button', { type: 'button', class: 'btn', onclick: () => { tab = 'categorias'; renderApp() } }, 'Crear categoría'))
    return root
  }
  if (!data.products.length) {
    root.append(el('p', { class: 'meta' }, 'Todavía no hay productos. Cargá el primero para que la carta tenga qué mostrar.'))
  }
  categories.forEach((category) => {
    const items = data.products.filter((product) => product.categoryId === category.id)
    root.append(el('div', { class: 'cat-head' }, [el('h3', {}, category.name)]))
    if (!items.length) root.append(el('p', { class: 'meta' }, 'Sin productos en esta categoría.'))
    const list = el('div', { class: 'list' })
    items.forEach((product, index) => list.append(productRow(product, index, items.length)))
    root.append(list)
  })
  return root
}

function productRow(product, index, total) {
  return el('article', { class: product.visible ? 'row' : 'row is-hidden' }, [
    product.image
      ? el('img', { src: product.image, alt: '', class: 'thumb' })
      : el('span', { class: 'logo sm mono', 'aria-hidden': 'true' }, '·'),
    el('div', {}, [
      el('strong', {}, product.name),
      product.visible ? null : el('span', { class: 'badge' }, 'Oculto'),
      product.description ? el('div', { class: 'meta' }, product.description) : null
    ]),
    el('div', { class: 'price-admin' }, money(product.price, data.company.currency)),
    el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'btn secondary small', onclick: () => openProduct(product) }, 'Editar'),
      el('button', { type: 'button', class: 'btn secondary small', disabled: index === 0, onclick: () => move('products', product.id, -1) }, 'Subir'),
      el('button', { type: 'button', class: 'btn secondary small', disabled: index === total - 1, onclick: () => move('products', product.id, 1) }, 'Bajar'),
      el('button', { type: 'button', class: 'btn danger small', onclick: () => removeProduct(product) }, 'Borrar')
    ])
  ])
}

function openProduct(product) {
  const preview = el('div', {})
  if (product?.image) preview.append(el('img', { class: 'preview', alt: '', src: product.image }))
  const file = el('input', { name: 'image', type: 'file', accept: 'image/jpeg,image/png,image/webp' })
  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (!chosen) return
    const img = el('img', { class: 'preview', alt: '' })
    img.src = URL.createObjectURL(chosen)
    preview.replaceChildren(img)
  })
  const select = el('select', { name: 'categoryId', required: true }, data.categories.map((category) => {
    const option = el('option', { value: category.id }, category.name)
    if (category.id === product?.categoryId) option.selected = true
    return option
  }))
  const error = el('p', { class: 'err', role: 'alert' })
  const form = el('form', { class: 'sheet-body' }, [
    el('h2', {}, product ? 'Editar producto' : 'Nuevo producto'),
    field('Nombre', el('input', { name: 'name', required: true, maxlength: '80', value: product?.name || '' })),
    field('Precio', el('input', { name: 'price', type: 'number', min: '0', step: '0.01', required: true, value: product ? String(product.price) : '' })),
    field('Categoría', select),
    field('Descripción', el('textarea', { name: 'description', maxlength: '280' }, product?.description || ''), 'Opcional. Una línea alcanza.'),
    field('Foto', file, 'JPG, PNG o WEBP. Hasta 5 MB.'),
    preview,
    el('label', { class: 'check' }, [
      el('input', { type: 'checkbox', name: 'visible', checked: product ? product.visible : true }),
      'Visible en la carta'
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
      let imagePath = product?.imagePath || ''
      if (file.files?.[0]) {
        const uploaded = await uploadImage(session.companyId, file.files[0])
        if (imagePath) await removeStoragePath(imagePath)
        imagePath = uploaded
      }
      const payload = {
        name: body.name,
        price: body.price,
        categoryId: body.categoryId,
        description: body.description || '',
        visible: form.elements.visible.checked,
        imagePath
      }
      if (product) await updateProduct(product.id, payload)
      else await createProduct(session.companyId, payload)
      dialog.close()
      toast(product ? 'Producto actualizado' : 'Producto cargado')
      await refresh()
    } catch (err) {
      error.textContent = err.message
      button.disabled = false
    }
  })
}

async function removeProduct(product) {
  const ok = await confirmDialog('Borrar producto', `Se quita “${product.name}” de la carta.`)
  if (!ok) return
  await deleteProduct(product.id)
  toast('Producto borrado')
  await refresh()
}

function viewCategories() {
  const root = el('section', { class: 'block' }, [el('h2', {}, 'Categorías')])
  const error = el('p', { class: 'err', role: 'alert' })
  const form = el('form', { class: 'row-actions' }, [
    el('input', { name: 'name', required: true, maxlength: '40', placeholder: 'Nueva categoría', 'aria-label': 'Nueva categoría' }),
    el('button', { class: 'btn', type: 'submit' }, 'Agregar')
  ])
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.textContent = ''
    try {
      await createCategory(session.companyId, Object.fromEntries(new FormData(form)).name)
      toast('Categoría creada')
      await refresh()
    } catch (err) {
      error.textContent = err.message
    }
  })
  root.append(form, error)
  const list = el('div', { class: 'list' })
  if (!data.categories.length) list.append(el('p', { class: 'meta' }, 'Todavía no hay categorías.'))
  data.categories.forEach((category, index) => {
    const count = data.products.filter((product) => product.categoryId === category.id).length
    list.append(el('article', { class: 'row' }, [
      el('span', { class: 'logo sm mono', 'aria-hidden': 'true' }, String(index + 1)),
      el('div', {}, [
        el('strong', {}, category.name),
        el('div', { class: 'meta' }, count === 1 ? '1 producto' : `${count} productos`)
      ]),
      el('div', {}),
      el('div', { class: 'row-actions' }, [
        el('button', { type: 'button', class: 'btn secondary small', onclick: () => rename(category) }, 'Renombrar'),
        el('button', { type: 'button', class: 'btn secondary small', disabled: index === 0, onclick: () => move('categories', category.id, -1) }, 'Subir'),
        el('button', { type: 'button', class: 'btn secondary small', disabled: index === data.categories.length - 1, onclick: () => move('categories', category.id, 1) }, 'Bajar'),
        el('button', { type: 'button', class: 'btn danger small', onclick: () => removeCategory(category, count) }, 'Borrar')
      ])
    ]))
  })
  root.append(list)
  return root
}

function rename(category) {
  const error = el('p', { class: 'err', role: 'alert' })
  const form = el('form', { class: 'sheet-body' }, [
    el('h2', {}, 'Renombrar categoría'),
    field('Nombre', el('input', { name: 'name', required: true, maxlength: '40', value: category.name })),
    error,
    el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn', type: 'submit' }, 'Guardar'),
      el('button', { class: 'btn secondary', type: 'button', onclick: () => dialog.close() }, 'Cancelar')
    ])
  ])
  const dialog = openDialog(form)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      await renameCategory(category.id, Object.fromEntries(new FormData(form)).name)
      dialog.close()
      toast('Categoría actualizada')
      await refresh()
    } catch (err) {
      error.textContent = err.message
    }
  })
}

async function removeCategory(category, count) {
  const detail = count
    ? `Se borra “${category.name}” y ${count === 1 ? '1 producto' : `${count} productos`}.`
    : `Se borra “${category.name}”.`
  const ok = await confirmDialog('Borrar categoría', detail)
  if (!ok) return
  await deleteCategory(category.id)
  toast('Categoría borrada')
  await refresh()
}

async function move(kind, id, dir) {
  if (kind === 'categories') await moveCategory(session.companyId, id, dir)
  else await moveProduct(session.companyId, id, dir)
  await refresh()
}

function viewCompany() {
  const company = data.company
  const preview = el('div', {})
  if (company.logo) preview.append(el('img', { class: 'preview', alt: '', src: company.logo }))
  const file = el('input', { name: 'logo', type: 'file', accept: 'image/jpeg,image/png,image/webp' })
  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (!chosen) return
    const img = el('img', { class: 'preview', alt: '' })
    img.src = URL.createObjectURL(chosen)
    preview.replaceChildren(img)
  })
  const error = el('p', { class: 'err', role: 'alert' })
  const form = el('form', { class: 'stack' }, [
    field('Nombre', el('input', { name: 'name', required: true, maxlength: '60', value: company.name })),
    field('Frase', el('input', { name: 'tagline', maxlength: '80', value: company.tagline || '' }), 'Aparece debajo del nombre en la carta.'),
    field('WhatsApp', el('input', { name: 'whatsapp', value: company.whatsapp || '', placeholder: '099 123 456' }), 'Si lo cargás, la carta muestra un botón para pedir.'),
    field('Moneda', el('input', { name: 'currency', maxlength: '6', value: company.currency || '$' })),
    field('Logo', file, 'Si no subís uno, la carta usa las iniciales.'),
    preview,
    error,
    el('button', { class: 'btn', type: 'submit' }, 'Guardar datos')
  ])
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button')
    button.disabled = true
    error.textContent = ''
    const body = Object.fromEntries(new FormData(form))
    try {
      let logoPath = company.logoPath || ''
      if (file.files?.[0]) {
        const uploaded = await uploadImage(session.companyId, file.files[0])
        if (logoPath) await removeStoragePath(logoPath)
        logoPath = uploaded
      }
      await updateCompanyLocal(session.companyId, {
        name: body.name,
        tagline: body.tagline,
        whatsapp: body.whatsapp,
        currency: body.currency,
        logo_path: logoPath
      })
      toast('Datos guardados')
      await refresh()
    } catch (err) {
      error.textContent = err.message
      button.disabled = false
    }
  })

  const passError = el('p', { class: 'err', role: 'alert' })
  const pass = el('form', { class: 'stack' }, [
    field('Clave nueva', el('input', { name: 'next', type: 'password', autocomplete: 'new-password', required: true, minlength: '6' })),
    passError,
    el('button', { class: 'btn secondary', type: 'submit' }, 'Cambiar clave')
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

  return el('section', { class: 'block' }, [
    el('h2', {}, 'Empresa'),
    el('p', { class: 'meta' }, `Usuario de este local: ${company.adminUsername}`),
    form,
    el('h2', {}, 'Clave'),
    pass
  ])
}

function viewQr() {
  const link = data.publicUrl
  const img = el('img', { alt: `QR de ${data.company.name}`, width: '280', height: '280' })
  qrDataUrl(link).then((url) => { img.src = url })
  return el('section', { class: 'block' }, [
    el('h2', {}, 'Código QR'),
    el('p', {}, 'Este código abre la carta de este local. Si el superadmin cambia el link, hay que volver a imprimirlo.'),
    el('div', { class: 'qr-frame' }, [img]),
    field('Link', el('input', { value: link, readonly: true })),
    el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: async () => { await copyText(link); toast('Link copiado') } }, 'Copiar link'),
      el('a', { class: 'btn secondary', href: `/imprimir/?slug=${encodeURIComponent(data.company.slug)}`, target: '_blank', rel: 'noopener' }, 'Imprimir lámina')
    ]),
    el('p', { class: 'meta' }, formatWhen(data.company.createdAt) ? `Alta ${formatWhen(data.company.createdAt)}` : '')
  ])
}

boot().catch((error) => {
  app.replaceChildren(el('main', { class: 'missing-page' }, [
    el('h1', {}, 'No se pudo abrir el panel'),
    el('p', {}, error.message)
  ]))
})
