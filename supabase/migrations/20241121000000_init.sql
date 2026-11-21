-- Carta QR multiempresa — esquema inicial

create extension if not exists "pgcrypto";

-- Perfiles (1:1 con auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('super', 'admin')),
  company_id uuid,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text not null default '',
  tagline text not null default '',
  whatsapp text not null default '',
  currency text not null default '$',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete set null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  sort integer not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  image_path text not null default '',
  sort integer not null default 0,
  visible boolean not null default true
);

create table public.settings (
  id integer primary key default 1 check (id = 1),
  public_base_url text not null default ''
);

insert into public.settings (id, public_base_url) values (1, '');

create index categories_company_sort on public.categories (company_id, sort);
create index products_company_sort on public.products (company_id, category_id, sort);
create index products_visible on public.products (company_id, visible);

-- Helpers RLS
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super'
  );
$$;

create or replace function public.is_company_admin(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and company_id = target
  );
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_company_id() from public;
revoke all on function public.is_super() from public;
revoke all on function public.is_company_admin(uuid) from public;
grant execute on function public.current_profile_role() to authenticated, anon;
grant execute on function public.current_company_id() to authenticated, anon;
grant execute on function public.is_super() to authenticated, anon;
grant execute on function public.is_company_admin(uuid) to authenticated, anon;

-- RLS
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.settings enable row level security;

-- profiles
create policy "profiles_select_own_or_super"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_super());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- companies
create policy "companies_public_read_active"
  on public.companies for select
  to anon, authenticated
  using (active = true or public.is_super() or public.is_company_admin(id));

create policy "companies_super_insert"
  on public.companies for insert
  to authenticated
  with check (public.is_super());

create policy "companies_super_or_admin_update"
  on public.companies for update
  to authenticated
  using (public.is_super() or public.is_company_admin(id))
  with check (public.is_super() or public.is_company_admin(id));

create policy "companies_super_delete"
  on public.companies for delete
  to authenticated
  using (public.is_super());

-- categories
create policy "categories_public_read"
  on public.categories for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = categories.company_id
        and (c.active = true or public.is_super() or public.is_company_admin(c.id))
    )
  );

create policy "categories_admin_write"
  on public.categories for insert
  to authenticated
  with check (public.is_super() or public.is_company_admin(company_id));

create policy "categories_admin_update"
  on public.categories for update
  to authenticated
  using (public.is_super() or public.is_company_admin(company_id))
  with check (public.is_super() or public.is_company_admin(company_id));

create policy "categories_admin_delete"
  on public.categories for delete
  to authenticated
  using (public.is_super() or public.is_company_admin(company_id));

-- products
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (
    (
      visible = true
      and exists (
        select 1 from public.companies c
        where c.id = products.company_id and c.active = true
      )
    )
    or public.is_super()
    or public.is_company_admin(company_id)
  );

create policy "products_admin_insert"
  on public.products for insert
  to authenticated
  with check (public.is_super() or public.is_company_admin(company_id));

create policy "products_admin_update"
  on public.products for update
  to authenticated
  using (public.is_super() or public.is_company_admin(company_id))
  with check (public.is_super() or public.is_company_admin(company_id));

create policy "products_admin_delete"
  on public.products for delete
  to authenticated
  using (public.is_super() or public.is_company_admin(company_id));

-- settings
create policy "settings_read_all"
  on public.settings for select
  to anon, authenticated
  using (true);

create policy "settings_super_update"
  on public.settings for update
  to authenticated
  using (public.is_super())
  with check (public.is_super());

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menus',
  'menus',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "menus_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menus');

create policy "menus_admin_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menus'
    and (
      public.is_super()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy "menus_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menus'
    and (
      public.is_super()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy "menus_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menus'
    and (
      public.is_super()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );
