import { getPublicBaseUrl, getPublicMenu, menuUrl } from './data.js'
import { el, initials, qrDataUrl } from './shared.js'

const app = document.querySelector('#app')
const params = new URLSearchParams(location.search)
const slug = params.get('slug') || location.pathname.split('/').filter(Boolean).pop()

async function boot() {
  if (!slug || slug === 'imprimir') {
    app.replaceChildren(el('p', {}, 'Falta el local. Abrí esta página desde el panel.'))
    return
  }

  const menu = await getPublicMenu(slug)
  if (!menu) {
    app.replaceChildren(el('p', {}, 'Esta carta no está disponible.'))
    return
  }

  const base = await getPublicBaseUrl()
  const url = menuUrl(base || location.origin, menu.company.slug)
  const qr = await qrDataUrl(url)

  const mark = menu.company.logo
    ? el('img', { class: 'mark', src: menu.company.logo, alt: '' })
    : el('div', { class: 'mark mono' }, initials(menu.company.name))

  document.title = `QR · ${menu.company.name}`
  app.replaceChildren(el('article', { class: 'card' }, [
    mark,
    el('p', { class: 'kicker' }, 'Carta online'),
    el('h1', {}, menu.company.name),
    el('img', { class: 'qr', src: qr, alt: `Código QR de ${menu.company.name}` }),
    el('p', {}, 'Escaneá para ver la carta'),
    el('p', { class: 'url' }, url),
    el('div', { class: 'actions' }, [
      el('button', { type: 'button', onclick: () => print() }, 'Imprimir'),
      el('a', { href: '/super/' }, 'Volver')
    ])
  ]))
}

boot().catch((error) => {
  app.replaceChildren(el('p', {}, error.message))
})
