'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { CATEGORY_LABELS, OPERATOR_LABELS, SCALE_LABELS, COST_LABELS } from '@/lib/utils/product-labels'

interface FilterGroup {
  key: string
  label: string
  options: { value: string; label: string }[]
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    key: 'category',
    label: 'Category',
    options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'operator_dependency',
    label: 'Operator Dependency',
    options: Object.entries(OPERATOR_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'scale_potential',
    label: 'Scale Potential',
    options: Object.entries(SCALE_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'cost_to_start',
    label: 'Cost to Start',
    options: Object.entries(COST_LABELS).map(([value, label]) => ({ value, label })),
  },
]

export function FilterSidebar() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const getSelected = useCallback(
    (key: string): string[] => {
      const val = searchParams.get(key)
      if (!val) return []
      return val.split(',').filter(Boolean)
    },
    [searchParams]
  )

  function handleChange(key: string, value: string, checked: boolean) {
    const current = getSelected(key)
    const updated = checked
      ? [...current, value]
      : current.filter((v) => v !== value)

    const params = new URLSearchParams(searchParams.toString())
    if (updated.length > 0) {
      params.set(key, updated.join(','))
    } else {
      params.delete(key)
    }
    // Reset page when filters change
    params.delete('page')
    router.push(`/library?${params.toString()}`)
  }

  function handleReset() {
    const params = new URLSearchParams()
    const q = searchParams.get('q')
    const sort = searchParams.get('sort')
    if (q) params.set('q', q)
    if (sort) params.set('sort', sort)
    router.push(`/library?${params.toString()}`)
  }

  const hasActiveFilters = FILTER_GROUPS.some((g) => getSelected(g.key).length > 0)

  return (
    <aside className="w-56 shrink-0 space-y-6">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Filters</span>
        {hasActiveFilters && (
          <button
            onClick={handleReset}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
          >
            Reset Filters
          </button>
        )}
      </div>

      {FILTER_GROUPS.map((group) => {
        const selected = getSelected(group.key)
        return (
          <div key={group.key} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.options.map((opt) => (
                <li key={opt.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`${group.key}-${opt.value}`}
                    checked={selected.includes(opt.value)}
                    onChange={(e) => handleChange(group.key, opt.value, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-300"
                  />
                  <label
                    htmlFor={`${group.key}-${opt.value}`}
                    className="text-sm cursor-pointer text-zinc-700 dark:text-zinc-200"
                  >
                    {opt.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </aside>
  )
}
