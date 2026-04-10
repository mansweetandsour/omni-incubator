import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const TABLES = [
  'profiles',
  'products',
  'ebooks',
  'user_ebooks',
  'orders',
  'subscriptions',
  'sweepstakes',
  'sweepstake_entries',
  'services',
  'sample_products',
  'lead_submissions',
]

interface PolicyRow {
  tablename: string
  policyname: string
  schemaname: string
}

async function main() {
  // Query pg_policies for policy counts per table
  const { data: policiesData, error: policiesError } = await supabase
    .from('pg_policies')
    .select('tablename, policyname, schemaname')
    .eq('schemaname', 'public')

  if (policiesError) {
    console.error('ERROR: Unable to query pg_policies.')
    console.error('Ensure the service role key has access to pg_policies.')
    console.error(policiesError.message)
    process.exit(1)
  }

  const policies = policiesData as PolicyRow[]

  // Count policies per table
  const policyCountMap = new Map<string, number>()
  for (const row of policies) {
    policyCountMap.set(row.tablename, (policyCountMap.get(row.tablename) ?? 0) + 1)
  }

  // Query pg_tables for RLS status
  const { data: tablesData, error: tablesError } = await supabase
    .from('pg_tables')
    .select('tablename, rowsecurity')
    .eq('schemaname', 'public')
    .in('tablename', TABLES)

  interface PgTableRow {
    tablename: string
    rowsecurity: boolean
  }

  const rlsMap = new Map<string, boolean>()

  if (tablesError) {
    // pg_tables may not be queryable via REST — fall back to reporting policy counts only
    console.warn('WARNING: Unable to query pg_tables for RLS enabled status.')
    console.warn('Reporting policy counts only. RLS on/off status unknown.')
    console.warn(tablesError.message)
  } else {
    const tables = tablesData as PgTableRow[]
    for (const row of tables) {
      rlsMap.set(row.tablename, row.rowsecurity)
    }
  }

  const ok: string[] = []
  const danger: string[] = []
  const warning: string[] = []
  const missing: string[] = []

  const foundInPolicies = new Set(
    policies.filter((p) => TABLES.includes(p.tablename)).map((p) => p.tablename)
  )
  const foundInTables = new Set(rlsMap.keys())

  for (const table of TABLES) {
    const rlsEnabled = rlsMap.get(table)
    const count = policyCountMap.get(table) ?? 0

    if (!foundInTables.has(table) && !foundInPolicies.has(table)) {
      missing.push(table)
      continue
    }

    if (rlsEnabled === undefined) {
      // Only policy data available
      if (count >= 1) {
        ok.push(`${table} (${count} policies — RLS status unknown, policies exist)`)
      } else {
        warning.push(`${table} (0 policies — RLS status unknown)`)
      }
    } else if (rlsEnabled && count >= 1) {
      ok.push(`${table} (${count} policies)`)
    } else if (rlsEnabled && count === 0) {
      danger.push(`${table} (RLS enabled but 0 policies — all queries rejected)`)
    } else {
      warning.push(`${table} (RLS disabled — open to all authenticated/anonymous users)`)
    }
  }

  console.log('\n=== RLS Audit Report ===\n')
  console.log('✅ OK (RLS on + policies present):')
  if (ok.length === 0) {
    console.log('   (none)')
  } else {
    ok.forEach((t) => console.log(`   ${t}`))
  }

  console.log('\n🚨 DANGER (RLS on + 0 policies — locked out):')
  if (danger.length === 0) {
    console.log('   (none)')
  } else {
    danger.forEach((t) => console.log(`   ${t}`))
  }

  console.log('\n⚠️  WARNING (RLS off — open to all):')
  if (warning.length === 0) {
    console.log('   (none)')
  } else {
    warning.forEach((t) => console.log(`   ${t}`))
  }

  if (missing.length > 0) {
    console.log('\n❓ NOT FOUND (table does not exist in public schema):')
    missing.forEach((t) => console.log(`   ${t}`))
  }

  console.log()

  if (danger.length > 0) {
    console.error('ACTION REQUIRED: Tables with RLS enabled but zero policies will reject all queries.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
