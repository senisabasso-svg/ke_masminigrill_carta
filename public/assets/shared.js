export function el(tag, attrs = {}, children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (key === 'class') node.className = value
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'checked' || key === 'value' || key === 'disabled' || key === 'selected') node[key] = value
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  const list = Array.isArray(children) ? children : children == null ? [] : [children]
  for (const child of list) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export async function api(url, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin' }
  if (body != null) {
    if (body instanceof FormData) options.body = body
    else {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(body)
    }
  }
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Sin conexión. Revisá que el servidor esté encendido.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo completar')
  return data
}

export function toast(message) {
  const zone = document.querySelector('#toasts')
  if (!zone) return
  const node = el('div', { class: 'toast', role: 'status' }, message)
  zone.append(node)
  setTimeout(() => node.remove(), 3200)
}

export function money(value, currency = '$') {
  const number = Number(value)
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(number) ? number : 0)
  return `${currency} ${formatted}`
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'C'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function logoNode(src, name, className = 'logo') {
  if (src) return el('img', { src, alt: name, class: className })
  return el('span', { class: `${className} mono`, 'aria-hidden': 'true' }, initials(name))
}

export function waLink(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `598${digits.slice(1)}`
  if (digits.length < 8) return ''
  return `https://wa.me/${digits}`
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    document.body.append(input)
    input.select()
    const ok = document.execCommand('copy')
    input.remove()
    return ok
  }
}

export function renderGate({ kicker, lede, form }) {
  return el('div', { class: 'gate' }, [
    el('section', { class: 'gate-brand on-dark' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow' }, kicker),
        el('h1', {}, 'Carta')
      ]),
      el('p', { class: 'lede' }, lede)
    ]),
    el('section', { class: 'gate-form' }, [form])
  ])
}

export function field(label, control, help) {
  return el('label', { class: 'field' }, [
    label,
    control,
    help ? el('span', { class: 'help' }, help) : null
  ])
}

export function confirmDialog(title, text, confirmLabel = 'Borrar') {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'sheet' })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      dialog.close()
      resolve(value)
    }
    dialog.append(el('div', { class: 'sheet-body' }, [
      el('h2', {}, title),
      el('p', {}, text),
      el('div', { class: 'row-actions' }, [
        el('button', { type: 'button', class: 'btn danger', onclick: () => finish(true) }, confirmLabel),
        el('button', { type: 'button', class: 'btn secondary', onclick: () => finish(false) }, 'Cancelar')
      ])
    ]))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(false)
    })
    dialog.addEventListener('close', () => dialog.remove())
    document.body.append(dialog)
    dialog.showModal()
  })
}

export function openDialog(content) {
  const dialog = el('dialog', { class: 'sheet' })
  dialog.append(content)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dialog.close()
  })
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
  const heading = dialog.querySelector('h2')
  if (heading) {
    heading.tabIndex = -1
    heading.focus()
  }
  return dialog
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

export function formatWhen(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}
