/**
 * Shaped skeleton components.
 * Use skeleton-shimmer (directional sweep) not animate-pulse (flat blink).
 * Each skeleton matches the exact layout of the content it replaces —
 * operators see a recognizable ghost of the data rather than generic rectangles.
 */

function Block({
  h = "h-4",
  w = "w-full",
  rounded = "rounded",
}: {
  h?: string;
  w?: string;
  rounded?: string;
}) {
  return <div className={`${h} ${w} ${rounded} skeleton-shimmer`} />;
}

// ---------------------------------------------------------------------------
// Action queue row — mirrors the 5-column grid in dashboard.tsx
// ---------------------------------------------------------------------------

export function SkeletonActionRow() {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto] items-center gap-4 border-b border-border px-6 py-4">
      <Block h="h-3" w="w-6" />
      <div className="space-y-2">
        <Block h="h-4" w="w-28" />
        <Block h="h-2.5" w="w-16" />
      </div>
      <div className="space-y-2">
        <Block h="h-4" w="w-48" />
        <Block h="h-2.5" w="w-32" />
      </div>
      <Block h="h-5" w="w-20" rounded="rounded-full" />
      <Block h="h-3" w="w-12" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client health card — mirrors HealthCard in dashboard.tsx / clients.index.tsx
// ---------------------------------------------------------------------------

export function SkeletonClientCard() {
  return (
    <div className="border-b border-r border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Block h="h-5" w="w-32" />
          <Block h="h-2.5" w="w-20" />
        </div>
        <Block h="h-3.5" w="w-3.5" rounded="rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Block h="h-2.5" w="w-12" />
          <Block h="h-6" w="w-8" />
        </div>
        <div className="space-y-1.5">
          <Block h="h-2.5" w="w-12" />
          <Block h="h-6" w="w-8" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <Block h="h-2.5" w="w-24" />
        <Block h="h-2.5" w="w-10" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview stat card — goal / leads / delivery / report
// ---------------------------------------------------------------------------

export function SkeletonStatCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Block h="h-2.5" w="w-16" />
          <Block h="h-7" w="w-24" />
        </div>
        <Block h="h-8" w="w-8" rounded="rounded-md" />
      </div>
      <div className="space-y-2">
        <Block h="h-2" w="w-full" />
        <Block h="h-3" w="w-3/4" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution board row — mirrors item rows in ExecutionBoard.tsx
// ---------------------------------------------------------------------------

export function SkeletonBoardRow() {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_8rem_10rem_auto] items-center gap-4 border-b border-border px-6 py-4">
      <div className="space-y-2">
        <Block h="h-4" w="w-48" />
        <Block h="h-2.5" w="w-32" />
      </div>
      <Block h="h-5" w="w-24" rounded="rounded-full" />
      <Block h="h-4" w="w-36" />
      <Block h="h-8" w="w-28" rounded="rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page inventory row
// ---------------------------------------------------------------------------

export function SkeletonPageRow() {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-4">
      <div className="space-y-2">
        <Block h="h-4" w="w-44" />
        <Block h="h-2.5" w="w-56" />
      </div>
      <Block h="h-5" w="w-16" rounded="rounded-full" />
      <Block h="h-5" w="w-12" rounded="rounded-full" />
      <Block h="h-3" w="w-10" />
      <Block h="h-7" w="w-16" rounded="rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead row
// ---------------------------------------------------------------------------

export function SkeletonLeadRow() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3"><Block h="h-3" w="w-12" /></td>
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Block h="h-4" w="w-28" />
          <Block h="h-2.5" w="w-20" />
        </div>
      </td>
      <td className="px-4 py-3"><Block h="h-3" w="w-10" /></td>
      <td className="px-4 py-3"><Block h="h-5" w="w-16" rounded="rounded-full" /></td>
      <td className="px-4 py-3"><Block h="h-3" w="w-24" /></td>
      <td className="px-4 py-3 text-right"><Block h="h-3" w="w-10" /></td>
      <td className="px-4 py-3 text-right"><Block h="h-7" w="w-20" rounded="rounded-md" /></td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

export function SkeletonReportCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="space-y-2">
        <Block h="h-2.5" w="w-20" />
        <Block h="h-6" w="w-36" />
        <Block h="h-3" w="w-24" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Block h="h-2.5" w="w-10" />
            <Block h="h-5" w="w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings row
// ---------------------------------------------------------------------------

export function SkeletonSettingsRow() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-border first:border-t-0">
      <div className="space-y-1.5">
        <Block h="h-4" w="w-28" />
        <Block h="h-2.5" w="w-48" />
      </div>
      <Block h="h-7" w="w-16" rounded="rounded-md" />
    </div>
  );
}
