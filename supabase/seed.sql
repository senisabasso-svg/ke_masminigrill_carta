-- Seed Ke Más Mini Grill (productos de la carta impresa)
-- Primero creá los usuarios en Authentication (ver SETUP.md),
-- después corré este SQL en el SQL Editor.

-- Empresa
insert into public.companies (
  id, name, slug, logo_path, tagline, whatsapp, currency, active, created_at
) values (
  'e8658f94-722c-4153-85cb-19244b25dd70',
  'Ke Más Mini Grill',
  'ke-mas-mini-grill',
  '',
  'Comida rica, casera y con mucho amor',
  '',
  '$',
  true,
  now()
) on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  tagline = excluded.tagline,
  currency = excluded.currency,
  active = excluded.active;

-- Categorías
insert into public.categories (id, company_id, name, sort) values
  ('8d1da6c2-8764-467e-8b35-8c375b714ce1', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Hamburguesas', 0),
  ('4fcb7681-013f-4d19-bfc8-2929f630755c', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Panchos', 1),
  ('414015b8-88d1-44d1-98d1-10c01399866a', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Papas fritas', 2),
  ('a34d482a-86ed-4363-acef-d52159681ee2', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Aguas', 3),
  ('aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Refrescos', 4),
  ('a54c76a6-83ff-4516-b184-6c563fcc8e23', 'e8658f94-722c-4153-85cb-19244b25dd70', 'Cervezas', 5)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

delete from public.products where company_id = 'e8658f94-722c-4153-85cb-19244b25dd70';

insert into public.products (company_id, category_id, name, description, price, sort, visible) values
  ('e8658f94-722c-4153-85cb-19244b25dd70', '8d1da6c2-8764-467e-8b35-8c375b714ce1', 'Común', 'Carne y aderezo', 150, 0, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '8d1da6c2-8764-467e-8b35-8c375b714ce1', 'Común con Papas', 'Carne, aderezo y porción de papas', 190, 1, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '8d1da6c2-8764-467e-8b35-8c375b714ce1', 'Completa', 'Carne, huevo, cheddar, panceta, jamón, queso, aceitunas y morrón', 220, 2, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '8d1da6c2-8764-467e-8b35-8c375b714ce1', 'Completa con Papas', 'Nuestra hamburguesa completa acompañada de papas fritas', 260, 3, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '4fcb7681-013f-4d19-bfc8-2929f630755c', 'Solo', '', 50, 0, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '4fcb7681-013f-4d19-bfc8-2929f630755c', 'Común', 'Con aderezos y papitas', 80, 1, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '4fcb7681-013f-4d19-bfc8-2929f630755c', 'Completo', '', 120, 2, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '414015b8-88d1-44d1-98d1-10c01399866a', 'Bandeja Común', '', 80, 0, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', '414015b8-88d1-44d1-98d1-10c01399866a', 'Bandeja con Cheddar', '', 130, 1, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'a34d482a-86ed-4363-acef-d52159681ee2', 'Agua sin gas', '', 70, 0, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'Coca-Cola', '600 ml', 80, 0, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'Coca-Cola', '2 L', 160, 1, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'Fanta', '', 80, 2, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'Sprite', '', 80, 3, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'aa83db5e-7926-4ad5-9ab0-becc2f0983d7', 'Pomelo', '', 85, 4, true),
  ('e8658f94-722c-4153-85cb-19244b25dd70', 'a54c76a6-83ff-4516-b184-6c563fcc8e23', 'Cerveza Patricia / Scool', '', 80, 0, true);

-- Vincular perfiles (después de crear los usuarios en Authentication).
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
