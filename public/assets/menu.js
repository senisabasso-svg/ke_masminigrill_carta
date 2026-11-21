import { el, logoNode, money, waLink } from './shared.js'

const app = document.querySelector('#app')
const slug = location.pathname.split('/').filter(Boolean).pop()

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function skeleton() {
  return el('div', { class: 'skel', role: 'status', 'aria-label': 'Cargando la carta' }, [
    el('div', { class: 'skel-line wide' }),
    el('div', { class: 'skel-line' }),
    el('div', { class: 'skel-line' }),
    el('div', { class: 'skel-line' })
  ])
}

function renderMissing(message) {
  document.title = 'Carta'
  app.replaceChildren(el('main', { class: 'missing' }, [
    el('p', { class: 'eyebrow' }, 'Carta'),
    el('h1', {}, 'No está disponible'),
    el('p', {}, message)
  ]))
}

function dish(product, currency) {
  const photo = product.image
    ? el('img', { src: product.image, alt: '', width: '76', height: '76', loading: 'lazy' })
    : null
  return el('article', { class: photo ? 'dish' : 'dish no-photo' }, [
    photo,
    el('div', {}, [
      el('div', { class: 'dish-top' }, [
        el('h3', {}, product.name),
        el('span', { class: 'leader', 'aria-hidden': 'true' }),
        el('span', { class: 'price' }, money(product.price, currency))
      ]),
      product.description ? el('p', { class: 'desc' }, product.description) : null
    ])
  ])
}

function render(data) {
  const { company, categories } = data
  document.title = `${company.name} · Carta`
  const cats = el('nav', { class: 'cats', 'aria-label': 'Categorías' })
  const sections = el('div', {})
  if (!categories.length) {
    sections.append(el('p', { class: 'empty' }, 'Esta carta todavía no tiene platos cargados.'))
  }
  categories.forEach((category, index) => {
    const id = `cat-${category.id}`
    const button = el('button', { type: 'button', class: 'chip' }, category.name)
    if (index === 0) button.setAttribute('aria-current', 'true')
    button.addEventListener('click', () => {
      document.getElementById(id)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      })
    })
    cats.append(button)
    const section = el('section', { class: 'section', id }, [el('h2', {}, category.name)])
    category.products.forEach((product) => section.append(dish(product, company.currency)))
    sections.append(section)
  })

  const page = el('main', { class: 'menu' }, [
    el('header', { class: 'identity' }, [
      logoNode(company.logo, company.name),
      el('h1', {}, company.name),
      company.tagline ? el('p', { class: 'tagline' }, company.tagline) : null
    ]),
    categories.length ? cats : null,
    sections
  ])

  const link = waLink(company.whatsapp)
  if (link) {
    page.append(el('div', { class: 'wa' }, [
      el('a', { href: link, target: '_blank', rel: 'noopener' }, 'Pedir por WhatsApp')
    ]))
  }
  app.replaceChildren(page)

  const buttons = [...cats.querySelectorAll('.chip')]
  const sectionNodes = [...sections.querySelectorAll('.section')]
  if (sectionNodes.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).at(-1)
      if (!visible) return
      const current = sectionNodes.indexOf(visible.target)
      buttons.forEach((button, index) => {
        if (index === current) button.setAttribute('aria-current', 'true')
        else button.removeAttribute('aria-current')
      })
    }, { rootMargin: '-30% 0px -55% 0px', threshold: 0.1 })
    sectionNodes.forEach((node) => observer.observe(node))
  }
}

async function boot() {
  app.replaceChildren(skeleton())
  try {
    const response = await fetch(`/api/public/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      renderMissing(data.error || 'Esta carta no está disponible')
      return
    }
    render(data)
  } catch {
    renderMissing('No se pudo cargar la carta. Probá de nuevo en un momento.')
  }
}

boot()
