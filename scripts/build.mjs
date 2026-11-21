import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const site = path.join(root, 'site')
const out = path.join(root, 'dist')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

const configPath = path.join(site, 'assets', 'config.js')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (url && key) {
  fs.writeFileSync(configPath, `window.CARTA_CONFIG = {\n  supabaseUrl: ${JSON.stringify(url)},\n  supabaseAnonKey: ${JSON.stringify(key)}\n}\n`)
  console.log('config.js generado desde variables de entorno')
}

fs.rmSync(out, { recursive: true, force: true })
copyDir(site, out)
console.log('Build listo en dist/ (publicá dist/ o site/ en Cloudflare Pages).')
