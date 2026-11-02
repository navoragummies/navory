-- =====================================================================
-- NÁVORA GUMMIES — base de datos (Supabase)
-- Productos del catálogo, textos editables de la web, pedidos y admins.
-- =====================================================================

-- funciones internas fuera de la API pública
create schema if not exists privado;
grant usage on schema privado to anon, authenticated;

-- ---------- admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function privado.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function privado.es_admin() from public;
grant execute on function privado.es_admin() to anon, authenticated;

create policy "admins: cada uno se ve" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------- productos ----------
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  descripcion text not null default '' check (char_length(descripcion) <= 400),
  categoria   text not null default '' check (char_length(categoria) <= 40),
  etiqueta    text not null default '' check (char_length(etiqueta) <= 30),
  precio      numeric(12,2) check (precio is null or precio >= 0),  -- null = a consultar
  unidad      text not null default '' check (char_length(unidad) <= 30), -- ej: "c/u", "x 10 u."
  minimo      int  not null default 1 check (minimo between 1 and 1000),
  foto_url    text not null default '',
  visible     boolean not null default true,
  agotado     boolean not null default false,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.productos enable row level security;

create policy "productos: público ve los visibles" on public.productos
  for select to anon, authenticated using (visible or (select privado.es_admin()));
create policy "productos: admin crea" on public.productos
  for insert to authenticated with check ((select privado.es_admin()));
create policy "productos: admin edita" on public.productos
  for update to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "productos: admin borra" on public.productos
  for delete to authenticated using ((select privado.es_admin()));

-- ---------- contenido (una sola fila con todos los textos) ----------
create table if not exists public.contenido (
  id         int primary key default 1 check (id = 1),
  datos      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.contenido enable row level security;

create policy "contenido: público lee" on public.contenido
  for select to anon, authenticated using (true);
create policy "contenido: admin edita" on public.contenido
  for update to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));

-- ---------- pedidos ----------
create table if not exists public.pedidos (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  telefono    text not null default '' check (char_length(telefono) <= 40),
  entrega     text not null default 'retiro' check (entrega in ('retiro','envio')),
  fecha       date,
  nota        text not null default '' check (char_length(nota) <= 600),
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  total       numeric(12,2) not null default 0 check (total >= 0),
  a_consultar boolean not null default false,
  estado      text not null default 'nuevo' check (estado in ('nuevo','confirmado','entregado','cancelado')),
  nota_admin  text not null default '' check (char_length(nota_admin) <= 600)
);
alter table public.pedidos enable row level security;

-- cualquiera puede dejar un pedido (lo hace la web al mandar el WhatsApp), siempre como "nuevo"
create policy "pedidos: público crea" on public.pedidos
  for insert to anon, authenticated with check (estado = 'nuevo' and nota_admin = '');
create policy "pedidos: admin ve" on public.pedidos
  for select to authenticated using ((select privado.es_admin()));
create policy "pedidos: admin edita" on public.pedidos
  for update to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "pedidos: admin borra" on public.pedidos
  for delete to authenticated using ((select privado.es_admin()));

create index if not exists pedidos_created_idx on public.pedidos (created_at desc);
create index if not exists productos_orden_idx on public.productos (orden);

-- updated_at automático
create or replace function privado.tocar_updated()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists productos_updated on public.productos;
create trigger productos_updated before update on public.productos
  for each row execute function privado.tocar_updated();
drop trigger if exists contenido_updated on public.contenido;
create trigger contenido_updated before update on public.contenido
  for each row execute function privado.tocar_updated();

-- ---------- fotos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "fotos: admin sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and (select privado.es_admin()));
create policy "fotos: admin reemplaza" on storage.objects
  for update to authenticated using (bucket_id = 'fotos' and (select privado.es_admin()));
create policy "fotos: admin borra" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and (select privado.es_admin()));

-- ---------- datos iniciales (lo que hoy dice la web) ----------
insert into public.contenido (id, datos) values (1, jsonb_build_object(
  'marquee',      E'UN MUNDO DE DULZURA EN CADA BOCADO\nATENCIÓN LAS 24HS\nQUILMES OESTE\n@NAVORA.GUMMIES',
  'hero_eyebrow', 'GOLOSINAS · DETALLES QUE ENDULZAN MOMENTOS',
  'hero_l1',      'UN MUNDO DE',
  'hero_l2',      'DULZURA',
  'hero_l3',      'EN CADA BOCADO',
  'hero_sub',     'Somos Návora Gummies, armamos gomitas que endulzan tus momentos.',
  'serv_eyebrow', 'PARA CUMPLEAÑOS, EVENTOS O PARA AUTO REGALARTE',
  'zona',         'Quilmes Oeste',
  'horario',      'Las 24 hs',
  'wa1',          '11 7100-4613',
  'wa2',          '11 2675-7131',
  'instagram',    'navora.gummies',
  'story_titulo', 'Un mundo de dulzura en cada bocado',
  'story_texto',  'Somos Návora Gummies, armamos gomitas que endulzan tus momentos: mesas dulces, vasos, bolsitas, brochetas, mix redondos y bandejas de gomitas — para cumpleaños, eventos o para auto regalarte.',
  'cta_linea',    '¿LISTA PARA ENDULZAR TU MOMENTO?',
  'envios',       'Coordinamos retiro o envío por WhatsApp.'
)) on conflict (id) do nothing;

insert into public.productos (nombre, descripcion, categoria, etiqueta, foto_url, orden)
select * from (values
  ('Vasos de gomitas',   'Vasitos individuales armados a mano, ideales para mesas dulces o para regalar.', 'Gomitas', '★ MÁS PEDIDO',       'assets/servicio-vasos.jpg',    1),
  ('Bolsitas de gomitas','Selladas y etiquetadas, perfectas como souvenir de cumpleaños o evento.',        'Gomitas', 'IDEAL PARA REGALAR', 'assets/servicio-bolsitas.jpg', 2),
  ('Bandejas de gomitas','Surtidos armados por sectores, pensados para mesas grandes y eventos.',         'Gomitas', 'PARA COMPARTIR',     'assets/servicio-bandeja.jpg',  3),
  ('Mesas dulces',       'Armamos la mesa completa para tu cumpleaños o evento.',                         'Eventos', '',                   '',                             4),
  ('Brochetas de gomitas','Brochetas coloridas de gomitas surtidas.',                                     'Gomitas', '',                   '',                             5),
  ('Mix redondos de gomitas','Mix de gomitas redondas surtidas.',                                         'Gomitas', '',                   '',                             6)
) v(nombre, descripcion, categoria, etiqueta, foto_url, orden)
where not exists (select 1 from public.productos);
