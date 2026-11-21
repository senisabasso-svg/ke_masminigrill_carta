# Carta QR multiempresa

Carta online con QR, panel del local y superadmin.

**Producción:** frontend estático (`site/`) en **Cloudflare Pages** + **Supabase** (Auth, Postgres, Storage).

Guía paso a paso: [SETUP.md](SETUP.md)

## Desarrollo local

1. Completá `site/assets/config.js` con tu Project URL y anon key.
2. `npm install`
3. `npm run preview` → http://localhost:8787

## Estructura

- `site/` — lo que se publica en Cloudflare
- `supabase/migrations/` — esquema SQL + RLS + Storage
- `supabase/functions/` — create-company y manage-company
- `supabase/seed.sql` — Ke Más Mini Grill con la carta impresa
