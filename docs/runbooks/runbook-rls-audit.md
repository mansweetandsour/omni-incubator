# RLS Audit Runbook

This runbook documents how to run the Row-Level Security (RLS) audit script against the Supabase database.

---

## Prerequisites

You must have the following environment variables set before running the script:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | The URL of your Supabase project (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role secret key from Supabase Project Settings → API |

Export them in your shell:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Or create a `.env.local` file and source it:

```bash
source .env.local
```

The script does **not** read `.env.local` automatically — variables must be present in the shell environment.

---

## How to Run

From the project root, run:

```bash
npx tsx scripts/verify-rls.ts
```

The script will:
1. Connect to Supabase using the service role key
2. Query `pg_policies` for policy counts on each of the 11 required tables
3. Query `pg_tables` for RLS enabled/disabled status
4. Print a categorized report to stdout
5. Exit with code `1` if any DANGER conditions are found or if env vars are missing

---

## Interpreting the Output

The report is divided into four categories:

### ✅ OK — RLS enabled + policies present

These tables are correctly protected. RLS is enabled and at least one policy exists. Normal operation continues.

### 🚨 DANGER — RLS enabled + zero policies

These tables have RLS switched on but **no policies** defined. This means **every query (including reads) is rejected** for all users, including authenticated ones. This will break your application.

**Immediate action required** — either add the missing policies or temporarily disable RLS while you add them.

### ⚠️ WARNING — RLS disabled

These tables are wide open. Any authenticated (or anonymous) user can read or modify all rows unless other access controls are in place at the application layer.

**Action required** — enable RLS and add appropriate policies as soon as possible.

### ❓ NOT FOUND — table does not exist

The table was not found in the `public` schema. This may indicate:
- The table was renamed
- A migration was not applied
- You are pointing to the wrong Supabase project

---

## Corrective Actions

### For DANGER tables (RLS on, 0 policies)

In Supabase SQL Editor, add at minimum a read policy:

```sql
-- Allow authenticated users to read their own rows (example for user-scoped tables)
CREATE POLICY "Allow own reads" ON public.<table_name>
  FOR SELECT USING (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "Service role bypass" ON public.<table_name>
  USING (auth.role() = 'service_role');
```

Or disable RLS temporarily while you write the policies:

```sql
ALTER TABLE public.<table_name> DISABLE ROW LEVEL SECURITY;
```

### For WARNING tables (RLS off)

Enable RLS and add policies:

```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
-- Then add appropriate policies (see DANGER example above)
```

### For NOT FOUND tables

Verify migrations have run:

```bash
# Check Supabase migration status
npx supabase db status
```

Ensure you are connected to the correct project and that all migration files have been applied.

---

## Tables Audited

The script checks the following 11 tables in the `public` schema:

1. `profiles`
2. `products`
3. `ebooks`
4. `user_ebooks`
5. `orders`
6. `subscriptions`
7. `sweepstakes`
8. `sweepstake_entries`
9. `services`
10. `sample_products`
11. `lead_submissions`
