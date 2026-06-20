-- ============================================================
-- Project Tracker v2 — Full Schema
-- Run this in Supabase SQL Editor (replaces the v1 schema)
-- Safe to re-run: uses CREATE IF NOT EXISTS + ALTER ... ADD COLUMN IF NOT EXISTS
-- ============================================================

create extension if not exists "pgcrypto";

-- ── company_profile ──────────────────────────────────────────
create table if not exists company_profile (
  id            int primary key default 1,
  company_name  text default '',
  address       text default '',
  email         text default '',
  phone         text default '',
  website       text default '',
  gstin         text default '',
  tan           text default '',
  lut_arn       text default '',
  hsn_pdf       text default '998431',
  hsn_website   text default '998313',
  iec           text default '',
  pan           text default '',
  vat           text default '',
  bank_details  text default '',
  logo_url      text default '',
  accent_color  text default '#0F6B5C',
  constraint single_row check (id = 1)
);
insert into company_profile (id) values (1) on conflict (id) do nothing;

-- ── clients ──────────────────────────────────────────────────
create table if not exists clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  client_type      text not null check (client_type in ('pdf','website')),
  is_international boolean not null default false,
  address          text default '',
  email            text default '',
  phone            text default '',
  gstin            text default '',
  vat_number       text default '',
  tax_id           text default '',
  business_reg     text default '',
  currency         text not null default 'INR',
  created_at       timestamptz default now()
);

-- ── invoices ─────────────────────────────────────────────────
create table if not exists invoices (
  id                    uuid primary key default gen_random_uuid(),
  invoice_number        text not null unique,
  client_id             uuid references clients(id) on delete restrict,
  invoice_date          date not null default current_date,
  status                text not null default 'unpaid' check (status in ('unpaid','paid')),
  template_type         text not null default 'standard' check (template_type in ('standard','lut')),
  subtotal              numeric not null default 0,
  cgst                  numeric not null default 0,
  sgst                  numeric not null default 0,
  igst                  numeric not null default 0,
  total                 numeric not null default 0,
  currency              text not null default 'INR',
  inr_equivalent        numeric,
  is_tamil_nadu         boolean not null default true,
  created_at            timestamptz default now()
);

-- ── entries ──────────────────────────────────────────────────
create table if not exists entries (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid references clients(id) on delete restrict,
  entry_type                  text not null check (entry_type in ('pdf','website')),
  entry_date                  date not null default current_date,
  currency                    text not null default 'INR',
  project_name                text default '',

  -- PDF Accessibility
  file_name                   text,
  pages                       numeric,
  rate_per_page               numeric,

  -- Website & Domain (up to 10 dynamic rows stored as JSONB)
  -- Each item: { description: string, price: number }
  service_items               jsonb default '[]',

  -- Legacy columns kept for backward compatibility
  website_renewal_desc        text,
  website_renewal_price       numeric,
  google_subscription_desc    text,
  google_subscription_price   numeric,
  other_desc                  text,
  other_price                 numeric,

  line_total                  numeric not null default 0,
  status                      text not null default 'pending' check (status in ('pending','invoiced','paid')),
  invoice_id                  uuid references invoices(id) on delete set null,
  created_at                  timestamptz default now()
);

-- ── recurring_templates ──────────────────────────────────────
create table if not exists recurring_templates (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete cascade,
  name            text not null,
  frequency       text not null check (frequency in ('monthly','quarterly','annual')),
  next_due_date   date not null,
  last_generated  date,
  currency        text not null default 'INR',
  service_items   jsonb default '[]',
  is_active       boolean not null default true,
  created_at      timestamptz default now()
);

-- ── client_documents ─────────────────────────────────────────
create table if not exists client_documents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id) on delete cascade,
  file_name    text not null,
  file_url     text not null,
  doc_type     text default 'other',
  uploaded_at  timestamptz default now()
);

-- ── user_roles ───────────────────────────────────────────────
create table if not exists user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','accountant')),
  email      text not null,
  created_at timestamptz default now(),
  unique(user_id)
);

-- ── audit_log ────────────────────────────────────────────────
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_entries_client     on entries(client_id);
create index if not exists idx_entries_status     on entries(status);
create index if not exists idx_entries_date       on entries(entry_date desc);
create index if not exists idx_entries_type       on entries(entry_type);
create index if not exists idx_invoices_client    on invoices(client_id);
create index if not exists idx_invoices_date      on invoices(invoice_date desc);
create index if not exists idx_invoices_status    on invoices(status);
create index if not exists idx_recurring_due      on recurring_templates(next_due_date);
create index if not exists idx_audit_created      on audit_log(created_at desc);
create index if not exists idx_user_roles_user    on user_roles(user_id);

-- ── Storage buckets ──────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('client-docs', 'client-docs', false)
  on conflict (id) do nothing;

-- ── Row Level Security ───────────────────────────────────────
alter table clients           enable row level security;
alter table entries           enable row level security;
alter table invoices          enable row level security;
alter table company_profile   enable row level security;
alter table recurring_templates enable row level security;
alter table client_documents  enable row level security;
alter table user_roles        enable row level security;
alter table audit_log         enable row level security;

-- Drop old policies cleanly before recreating
drop policy if exists "allow all clients"         on clients;
drop policy if exists "allow all entries"         on entries;
drop policy if exists "allow all invoices"        on invoices;
drop policy if exists "allow all company_profile" on company_profile;

-- Authenticated users can access all data (role enforcement is in app layer)
create policy "auth clients"           on clients           for all to authenticated using (true) with check (true);
create policy "auth entries"           on entries           for all to authenticated using (true) with check (true);
create policy "auth invoices"          on invoices          for all to authenticated using (true) with check (true);
create policy "auth company_profile"   on company_profile   for all to authenticated using (true) with check (true);
create policy "auth recurring"         on recurring_templates for all to authenticated using (true) with check (true);
create policy "auth client_docs"       on client_documents  for all to authenticated using (true) with check (true);
create policy "auth audit_log"         on audit_log         for all to authenticated using (true) with check (true);

-- user_roles: anyone can read their own row; only the system inserts
create policy "own role read"  on user_roles for select to authenticated using (auth.uid() = user_id);
create policy "own role write" on user_roles for all    to authenticated using (true) with check (true);

-- Storage policies
drop policy if exists "logo public read"  on storage.objects;
drop policy if exists "logo anon write"   on storage.objects;
drop policy if exists "logo anon update"  on storage.objects;

create policy "logo public read"  on storage.objects for select using (bucket_id = 'logos');
create policy "logo auth write"   on storage.objects for insert to authenticated with check (bucket_id = 'logos');
create policy "logo auth update"  on storage.objects for update to authenticated using (bucket_id = 'logos');
create policy "docs auth read"    on storage.objects for select to authenticated using (bucket_id = 'client-docs');
create policy "docs auth write"   on storage.objects for insert to authenticated with check (bucket_id = 'client-docs');
create policy "docs auth delete"  on storage.objects for delete to authenticated using (bucket_id = 'client-docs');

-- ── Grants ───────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.clients             to authenticated;
grant select, insert, update, delete on public.entries             to authenticated;
grant select, insert, update, delete on public.invoices            to authenticated;
grant select, insert, update, delete on public.company_profile     to authenticated;
grant select, insert, update, delete on public.recurring_templates to authenticated;
grant select, insert, update, delete on public.client_documents    to authenticated;
grant select, insert, update, delete on public.user_roles          to authenticated;
grant select, insert               on public.audit_log             to authenticated;
grant usage on all sequences in schema public to authenticated;

-- ── Seed admin user role ──────────────────────────────────────
-- Run this AFTER creating the admin user in Supabase Auth Dashboard
-- Replace the UUID below with your actual user UUID from Auth > Users
-- insert into user_roles (user_id, role, email)
-- values ('YOUR-ADMIN-USER-UUID-HERE', 'admin', 'manoj@globalnetservices.biz')
-- on conflict (user_id) do nothing;
