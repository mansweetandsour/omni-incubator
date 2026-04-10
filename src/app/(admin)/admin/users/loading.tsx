import { Skeleton } from '@/components/ui/skeleton'

export default function UsersLoading() {
  return (
    <div>
      {/* Header */}
      <Skeleton className="h-8 w-24 mb-4" />

      {/* Search input */}
      <Skeleton className="h-9 w-64 mb-6" />

      {/* Table skeleton */}
      <div className="rounded-md border overflow-hidden">
        {/* Header row */}
        <div className="flex gap-4 px-4 py-3 border-b bg-zinc-50 dark:bg-zinc-900">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
