import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: verify user is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auth: verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Refresh entry verification (await — need fresh data)
  await adminClient.rpc('refresh_entry_verification')

  // Fetch export data via RPC
  const { data, error } = await adminClient.rpc('export_sweepstake_entries', {
    p_sweepstake_id: id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV
  const header =
    'user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents'

  const rows = (data ?? []).map((row: {
    user_email: string | null
    display_name: string | null
    total_entries: number | null
    purchase_entries: number | null
    non_purchase_entries: number | null
    admin_entries: number | null
    coupon_bonus_entries: number | null
    list_price_basis_cents: number | null
    amount_collected_cents: number | null
    actual_order_total_cents: number | null
  }) =>
    [
      escapeCSV(row.user_email),
      escapeCSV(row.display_name),
      escapeCSV(row.total_entries),
      escapeCSV(row.purchase_entries),
      escapeCSV(row.non_purchase_entries),
      escapeCSV(row.admin_entries),
      escapeCSV(row.coupon_bonus_entries),
      escapeCSV(row.list_price_basis_cents),
      escapeCSV(row.amount_collected_cents),
      escapeCSV(row.actual_order_total_cents),
    ].join(',')
  )

  const csv = [header, ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sweepstake-${id}-entries.csv"`,
    },
  })
}
