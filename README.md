# Discount Calculator

A lightweight web app for sales reps to quickly see compliant discount options.

## Scenario support
1. Amendment: if current PPL is `<= 108`, lowest allowed price is configurable (default `175`).
2. Amendment: if current PPL is `109 - 131`, lowest allowed price is configurable (default `190`).
3. Amendment: if current PPL is `>= 132`, lowest allowed price is configurable (default `205`).
4. Net New: pricing discount is based on license volume tiers (exactly 5 tiers).

## Pages
- `index.html`: rep calculator.
- `admin.html`: passcode-protected admin settings (`lucid1`).

## Admin settings model
- Net New List Price.
- Amendment rules table:
  - `Min Current PPL`
  - `Max Current PPL` (blank means open-ended)
  - `Lowest Allowed Price`
- Net New volume table (exactly 5 tiers):
  - `Min Licenses`
  - `Max Licenses` (blank means open-ended)
  - `Discount %`

## Calculation behavior
- Amendment deals:
  - Match current PPL to an amendment rule.
  - Show a discount table in 5% increments from list price down to the rule floor.
- Net New deals:
  - Match proposed licenses to a volume tier.
  - Show a discount table in 5% increments up to the tier max discount.
- All options are filtered by `IARR >= 0`.

## IARR formula
`IARR = new ARR - current ARR`

Where:
- `current ARR = current PPL * current licenses` for amendments.
- `current ARR = 0` for net new.
- `new ARR = final PPL * proposed licenses`.

## Storage
- Primary storage: Neon Postgres table `public.app_config` (via Vercel API).
- Fallback storage: localStorage key `discount_config_v2` when API is unavailable.

## Run locally
1. Optional quick mode (no Neon): open `index.html` in a browser.
2. Full mode (with APIs):
   - Install dependencies: `npm install`
   - Install Vercel CLI: `npm i -g vercel`
   - Create `.env.local` in project root:
     - `DATABASE_URL=...`
     - `ADMIN_PASSCODE=...`
   - Start local Vercel dev server: `vercel dev`
   - Open `http://localhost:3000`

## Neon setup
1. Create a Neon project and copy its connection string.
2. Run `neon/schema.sql` against your Neon database.
3. Set `DATABASE_URL` to the Neon connection string in local and Vercel environments.

## Move existing data
1. In Supabase, export the `public.app_config` row for `app_id = 'discount-app'`.
2. Insert that row into Neon after running the new schema, for example:

```sql
insert into public.app_config (app_id, config, updated_at)
values ('discount-app', '{"netNewListPrice":225,"renewalRules":[],"netNewVolumeRules":[]}'::jsonb, now())
on conflict (app_id)
do update set
  config = excluded.config,
  updated_at = now();
```

3. Replace the example JSON above with the actual `config` payload exported from Supabase.

## Deploy to Vercel
1. Push this repo to GitHub.
2. In Vercel, import the repo as a new project.
3. Add environment variables:
   - `DATABASE_URL`
   - `ADMIN_PASSCODE`
4. Deploy.

## Notes
- `admin.html` verifies passcode through `/api/admin-auth`.
- Settings saves go through `/api/config` and are written to Neon.
