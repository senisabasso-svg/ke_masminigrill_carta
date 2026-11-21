import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm'

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

export function toEmail(login) {
  const value = String(login || '').trim().toLowerCase()
  if (!value) return ''
  return value.includes('@') ? value : `${value}@carta.local`
}

export function assertConfig() {
  const cfg = window.CARTA_CONFIG || {}
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.includes('TU-PROYECTO')) {
    throw new Error('Falta configurar site/assets/config.js con tu proyecto Supabase.')
  }
  return cfg
}

let client
export function sb() {
  if (client) return client
  const cfg = assertConfig()
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  })
  return client
}

export function publicUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const cfg = assertConfig()
  return `${cfg.supabaseUrl}/storage/v1/object/public/menus/${path.replace(/^\/+/, '')}`
}

export function mapCompany(row, adminUsername = '') {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: publicUrl(row.logo_path),
    logoPath: row.logo_path || '',
    tagline: row.tagline || '',
    whatsapp: row.whatsapp || '',
    currency: row.currency || '$',
    active: row.active,
    createdAt: row.created_at,
    adminUsername
  }
}

export function mapProduct(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description || '',
    price: Number(row.price),
    image: publicUrl(row.image_path),
    imagePath: row.image_path || '',
    sort: row.sort,
    visible: row.visible
  }
}

export function explainError(error) {
  const message = String(error?.message || error || 'No se pudo completar')
  if (/invalid login|invalid credentials/i.test(message)) return 'Usuario o clave incorrectos'
  if (/JWT|session/i.test(message) && /expired|missing/i.test(message)) return 'La sesión venció. Volvé a ingresar.'
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Sin conexión. Revisá internet o la URL de Supabase.'
  return message
}

export async function qrDataUrl(text) {
  const QRCode = (await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm')).default
  return QRCode.toDataURL(text, {
    width: 900,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1e1a16', light: '#f4efe6' }
  })
}
