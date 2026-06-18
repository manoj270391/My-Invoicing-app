-- ============================================================
-- Project Tracker + Invoice Generator — Database Schema
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New Query → paste this whole file → Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Clients ----------
-- client_type: 'pdf' (PDF Accessibility) or 'website' (Website & Domain Maintenance)
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type text not null check (client_type in ('pdf','website')),
  address text default '',
  email text default '',
  phone text default '',
  gstin text default '',
  created_at timestamptz default now()
);

-- ---------- Invoices ----------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid references clients(id) on delete restrict,
  invoice_date date not null default current_date,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  subtotal numeric not null default 0,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  total numeric not null default 0,
  is_tamil_nadu boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- Entries ----------
-- Single ledger table for BOTH client types. Fields not relevant to a given
-- type are simply left null. entry_type mirrors clients.client_type so rows
-- are self-describing even if a client's type changes later.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete restrict,
  entry_type text not null check (entry_type in ('pdf','website')),
  entry_date date not null default current_date,

  -- PDF Accessibility fields
  file_name text,
  pages numeric,
  rate_per_page numeric,

  -- Website & Domain Maintenance fields
  website_renewal_desc text,
  website_renewal_price numeric,
  google_subscription_desc text,
  google_subscription_price numeric,
  other_desc text,
  other_price numeric,

  -- Computed line total (pre-GST), works for either type
  line_total numeric generated always as (
    coalesce(pages,0) * coalesce(rate_per_page,0)
    + coalesce(website_renewal_price,0)
    + coalesce(google_subscription_price,0)
    + coalesce(other_price,0)
  ) stored,

  status text not null default 'pending' check (status in ('pending','invoiced','paid')),
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_entries_client on entries(client_id);
create index if not exists idx_entries_status on entries(status);
create index if not exists idx_invoices_client on invoices(client_id);

-- ---------- Company profile (single row — your business details + logo) ----------
create table if not exists company_profile (
  id int primary key default 1,
  company_name text default '',
  address text default '',
  email text default '',
  phone text default '',
  gstin text default '',
  bank_details text default '',
  logo_url text default '',
  accent_color text default '#0F6B5C',
  constraint single_row check (id = 1)
);
insert into company_profile (id) values (1) on conflict (id) do nothing;

-- ---------- Storage bucket for logo ----------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Allow public read + anon write (fine for a single-user private tool;
-- tighten later if you add auth)
drop policy if exists "logo public read" on storage.objects;
create policy "logo public read" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "logo anon write" on storage.objects;
create policy "logo anon write" on storage.objects
  for insert with check (bucket_id = 'logos');

drop policy if exists "logo anon update" on storage.objects;
create policy "logo anon update" on storage.objects
  for update using (bucket_id = 'logos');

-- ---------- Row Level Security ----------
-- This is a single-user tool with no login, so we keep RLS permissive
-- (anon key can read/write everything). Do NOT expose the anon key
-- publicly beyond your own use, and consider adding Supabase Auth later
-- if you ever add a second user.
alter table clients enable row level security;
alter table entries enable row level security;
alter table invoices enable row level security;
alter table company_profile enable row level security;

drop policy if exists "allow all clients" on clients;
create policy "allow all clients" on clients for all using (true) with check (true);

drop policy if exists "allow all entries" on entries;
create policy "allow all entries" on entries for all using (true) with check (true);

drop policy if exists "allow all invoices" on invoices;
create policy "allow all invoices" on invoices for all using (true) with check (true);

drop policy if exists "allow all company_profile" on company_profile;
create policy "allow all company_profile" on company_profile for all using (true) with check (true);
