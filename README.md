# Project Tracker & Invoice Generator

A web app for logging client work (PDF accessibility jobs and website/domain
maintenance) and turning unbilled entries into GST-compliant invoice PDFs with
one click. Data lives in your own free Supabase project, so you can use it
from any device, anywhere.

## What it does

- **Ledger** — log work per client: file name/pages/rate for PDF accessibility
  clients, or website renewal / Google subscription / other charges for
  maintenance clients. Totals are calculated automatically.
- **Clients** — store each client's name, type, GSTIN, address, and contact
  details once.
- **Generate invoice** — select pending entries for one client, and the app
  creates an invoice number, calculates GST automatically (CGST+SGST for Tamil
  Nadu GSTINs starting with `33`, IGST for everyone else), and downloads a
  styled PDF with your logo and company details — **without** internal columns
  like status, only what belongs on a real invoice.
- **No double-billing** — once entries are invoiced, they disappear from the
  "pending" pool and can't be selected again for a new invoice.
- **Invoices page** — see invoice history, mark each as Paid/Unpaid, and
  re-download any PDF.
- **Settings** — upload your logo, set your brand color, and store your
  company + bank details once; they appear on every invoice automatically.

## 1. Set up Supabase (free, ~5 minutes)

1. Go to [supabase.com](https://supabase.com) → create a free account →
   **New project**. Pick any name/region/password (save the DB password
   somewhere safe — you won't need it for this app, but Supabase asks for it).
2. Once the project is ready, open **SQL Editor** in the left sidebar →
   **New query**.
3. Open `supabase_schema.sql` (included in this folder), copy the whole file,
   paste it into the SQL editor, and click **Run**. This creates all the
   tables, the storage bucket for your logo, and security policies.
4. Go to **Project Settings → API**. You'll need two values from this page:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

## 2. Configure the app

1. In this project folder, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
2. Open `.env` and paste in your Project URL and anon key:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 3. Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Go to **Settings**
first and fill in your company name, address, GSTIN, bank details, and logo —
these appear on every invoice.

## 4. Deploy it so you can access it anywhere

The easiest free option is **Vercel** or **Netlify**:

1. Push this project folder to a GitHub repository.
2. On [vercel.com](https://vercel.com) (or netlify.com), click **New Project**
   → import your repo.
3. When asked for environment variables, add the same two from your `.env`
   file (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy. You'll get a permanent URL (e.g. `your-tracker.vercel.app`) you can
   open from your phone, laptop, anywhere — the data is the same everywhere
   because it all lives in Supabase.

No server to maintain — Vercel/Netlify host the static app for free, and
Supabase hosts the database for free (well within free-tier limits for
single-user use).

## Notes on GST logic

- Tamil Nadu clients are detected automatically: any client whose GSTIN starts
  with `33` gets **CGST 9% + SGST 9%** (18% total).
  All other states get **IGST 18%**.
- If a client has no GSTIN on file, the invoice modal defaults to Tamil Nadu
  but lets you switch the tax type manually before generating.
- GST rates are currently fixed at 18% in `src/lib/gst.js`. If your rate ever
  changes, that's the one place to update it.

## Notes on security

This is built as a **single-user tool with no login** for simplicity, exactly
as scoped. The database policies allow full read/write access to anyone who
has your Supabase anon key (which is embedded in the deployed app's code —
this is normal for anon keys, but it does mean **don't share your deployed
app's URL publicly** if you'd rather keep your client list and prices private).
If you ever want a second user or stricter access control, Supabase Auth can
be added later — just ask.

## Project structure

```
src/
  lib/
    supabase.js      → Supabase client setup
    api.js            → all database read/write functions
    gst.js             → GST calculation (the only place tax math lives)
    pdfInvoice.js     → builds the invoice PDF
  pages/
    LedgerPage.jsx     → main tracker + entry form + invoice trigger
    ClientsPage.jsx    → client list + add/edit
    InvoicesPage.jsx   → invoice history + paid/unpaid toggle
    SettingsPage.jsx   → company profile + logo + branding
  components/
    GenerateInvoiceModal.jsx → invoice preview/confirm before generating
    Modal.jsx, Toast.jsx, Icons.jsx → shared UI pieces
supabase_schema.sql    → run once in Supabase SQL Editor
```
