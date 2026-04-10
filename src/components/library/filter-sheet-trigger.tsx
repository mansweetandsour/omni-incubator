'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { FilterSidebar } from './filter-sidebar'

export function FilterSheetTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
          Filters
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto">
        <SheetTitle className="sr-only">Filters</SheetTitle>
        <div className="pt-6">
          <FilterSidebar />
        </div>
      </SheetContent>
    </Sheet>
  )
}
