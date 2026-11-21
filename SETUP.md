# Carta QR · Supabase + Cloudflare Pages

Frontend estático en Cloudflare. Datos, login y fotos en Supabase (plan free).

## 1. Proyecto Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegá y ejecutá el contenido de `supabase/migrations/20241121000000_init.sql`.
3. En **Authentication → Providers → Email**:
   - Confirm email: **desactivado** (para poder entrar de inmediato).
   - Disable sign ups públicos si querés (los admins se crean desde el superadmin / dashboard).
4. En **Project Settings → API** copiá:
   - Project URL
   - `anon` `public` key
5. Pegá esas claves en `site/assets/config.js` (hay un ejemplo en `config.example.js`).

## 2. Usuarios iniciales

En **Authentication → Users → Add user**:

| Email | Clave sugerida | Rol |
| --- | --- | --- |
| `superadmin@carta.local` | `ke-mas-2026` | Superadmin |
| `kmas@carta.local` | `kmas-2026` | Admin Ke Más |

Después, en **SQL Editor**, ejecutá `supabase/seed.sql` (empresa + productos) y vinculá los perfiles:

```sql
insert into public.profiles (id, role, company_id, username)
select id, 'super', null, 'superadmin'
from auth.users
where email = 'superadmin@carta.local'
on conflict (id) do update set role = excluded.role, username = excluded.username;

insert into public.profiles (id, role, company_id, username)
select id, 'admin', 'e8658f94-722c-4153-85cb-19244b25dd70', 'kmas'
from auth.users
where email = 'kmas@carta.local'
on conflict (id) do update set
  role = excluded.role,
  company_id = excluded.company_id,
  username = excluded.username;
```

El login acepta `superadmin` o `superadmin@carta.local` (si no hay `@`, se completa con `@carta.local`).

## 3. Edge Functions

Con [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy create-company
supabase functions deploy manage-company
```

Las functions usan `SUPABASE_SERVICE_ROLE_KEY` (la inyecta Supabase sola al desplegar).

Sirven para:
- crear empresa + usuario admin
- editar / pausar / borrar empresa y resetear clave del admin

## 4. Logo de Ke Más (opcional)

1. Entrá a `/admin/` con `kmas` / `kmas-2026`.
2. Empresa → subí el logo JPG/PNG/WEBP.

O subilo a Storage bucket `menus` en la carpeta del `company_id` y actualizá `companies.logo_path`.

## 5. Cloudflare Pages

1. Creá un proyecto Pages.
2. Conectá el repo **o** subí la carpeta `site/` (Direct Upload).
3. Build settings:
   - **Build command:** `npm run build` (opcional; o dejalo vacío y usá output `site`)
   - **Output directory:** `site` (o `dist` si usás el build)
4. Variables de entorno en Cloudflare (recomendado si usás `npm run build`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Si no usás variables, editá `site/assets/config.js` en el repo antes de publicar.
6. En el dashboard de Cloudflare, la URL queda tipo `https://tu-proyecto.pages.dev`.
7. Entrá a `/super/`, guardá esa URL en **Dirección pública**.
8. En Supabase → **Authentication → URL configuration**:
   - Site URL = tu URL de Cloudflare
   - Redirect URLs = la misma

Los QR usan esa dirección pública.

## 6. Probar en local

```bash
npm install
npm run preview
```

Abrí `http://localhost:8787` (necesitás `config.js` con claves reales).

## Rutas

| Ruta | Uso |
| --- | --- |
| `/` | Inicio |
| `/super/` | Alta de empresas y QR |
| `/admin/` | Editar productos, precios y fotos |
| `/c/ke-mas-mini-grill` | Carta pública |
| `/imprimir/?slug=ke-mas-mini-grill` | Lámina para imprimir |

## Notas

- El servidor Node viejo (`server.js`) ya no se usa para producción. Queda solo como referencia.
- Fotos: bucket público `menus`, máx. 5 MB, JPG/PNG/WEBP.
- Free tier de Supabase alcanza para varias cartas chicas; mirá límites de Storage y Auth si crece mucho.
