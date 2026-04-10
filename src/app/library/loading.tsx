import { Skeleton } from '@/components/ui/skeleton'

export default function LibraryLoading() {
  return (
    <div className="container mx-auto py-10 px-4">
      {/* h1 bar */}
      <Skeleton className="h-9 w-48 mb-6" />

      {/* Search + sort bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="flex gap-8">
        {/* Sidebar skeleton — desktop only */}
        <div className="hidden md:block">
          <Skeleton className="w-56 h-96" />
        </div>

        {/* Product grid skeleton */}
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-lg border overflow-hidden">
                <Skeleton className="w-full" style={{ paddingBottom: '133.33%', height: 0, position: 'relative' }}>
                  <span />
                </Skeleton>
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
