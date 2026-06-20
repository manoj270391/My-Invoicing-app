-- Run this in Supabase SQL Editor if you've already created your database
-- (replaces the single hsn_sac field with two business-type-specific fields)

alter table company_profile add column if not exists hsn_pdf text default '998431';
alter table company_profile add column if not exists hsn_website text default '998313';

-- Optional: if you previously set hsn_sac and want to migrate that value
-- update company_profile set hsn_pdf = hsn_sac where hsn_sac is not null and hsn_sac != '';
