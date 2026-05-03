import { RECOVERY_MUSCLE_GROUPS, type RecoveryMuscle } from '../lib/recoveryMuscles'

function sorenessFill(level: number): string {
  if (level <= 0) return 'rgba(46,46,62,0.55)'
  if (level === 1) return 'rgba(82,82,110,0.85)'
  if (level === 2) return 'rgba(202,138,4,0.55)'
  if (level === 3) return 'rgba(234,179,8,0.75)'
  if (level === 4) return 'rgba(249,115,22,0.8)'
  return 'rgba(239,68,68,0.85)'
}

interface BodySorenessMapProps {
  value: Partial<Record<RecoveryMuscle, number>>
  onChange: (next: Partial<Record<RecoveryMuscle, number>>) => void
}

function cycleLevel(current: number | undefined): number {
  const c = current ?? 0
  return c >= 5 ? 0 : c + 1
}

export function BodySorenessMap({ value, onChange }: BodySorenessMapProps) {
  const tap = (id: RecoveryMuscle) => {
    onChange({ ...value, [id]: cycleLevel(value[id]) })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-gray-500">
        Tap a region to cycle soreness <span className="text-gray-400">0–5</span> (0 = none).
      </p>
      <div className="flex flex-wrap items-start justify-center gap-6">
        <div className="relative shrink-0">
          <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-wider text-gray-600">
            Front
          </span>
          <svg width={140} height={260} viewBox="0 0 140 260" className="overflow-visible">
            {/* Head (non-interactive) */}
            <ellipse cx={70} cy={22} rx={18} ry={20} fill="#1a1a28" stroke="#2e2e3e" strokeWidth={1} />
            {/* Shoulders */}
            <ellipse
              role="button"
              tabIndex={0}
              cx={70}
              cy={52}
              rx={44}
              ry={14}
              fill={sorenessFill(value.shoulders ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none transition-colors hover:opacity-90"
              onClick={() => tap('shoulders')}
              onKeyDown={(e) => e.key === 'Enter' && tap('shoulders')}
            />
            {/* Chest */}
            <ellipse
              role="button"
              tabIndex={0}
              cx={70}
              cy={78}
              rx={32}
              ry={22}
              fill={sorenessFill(value.chest ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('chest')}
              onKeyDown={(e) => e.key === 'Enter' && tap('chest')}
            />
            {/* Core */}
            <rect
              role="button"
              tabIndex={0}
              x={44}
              y={98}
              width={52}
              height={48}
              rx={10}
              fill={sorenessFill(value.core ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('core')}
              onKeyDown={(e) => e.key === 'Enter' && tap('core')}
            />
            {/* Biceps L / R */}
            <ellipse
              role="button"
              tabIndex={0}
              cx={38}
              cy={88}
              rx={12}
              ry={28}
              fill={sorenessFill(value.biceps ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('biceps')}
              onKeyDown={(e) => e.key === 'Enter' && tap('biceps')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={102}
              cy={88}
              rx={12}
              ry={28}
              fill={sorenessFill(value.biceps ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('biceps')}
              onKeyDown={(e) => e.key === 'Enter' && tap('biceps')}
            />
            {/* Quads */}
            <ellipse
              role="button"
              tabIndex={0}
              cx={56}
              cy={168}
              rx={18}
              ry={52}
              fill={sorenessFill(value.quads ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('quads')}
              onKeyDown={(e) => e.key === 'Enter' && tap('quads')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={84}
              cy={168}
              rx={18}
              ry={52}
              fill={sorenessFill(value.quads ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('quads')}
              onKeyDown={(e) => e.key === 'Enter' && tap('quads')}
            />
            {/* Calves */}
            <ellipse
              role="button"
              tabIndex={0}
              cx={56}
              cy={232}
              rx={14}
              ry={22}
              fill={sorenessFill(value.calves ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('calves')}
              onKeyDown={(e) => e.key === 'Enter' && tap('calves')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={84}
              cy={232}
              rx={14}
              ry={22}
              fill={sorenessFill(value.calves ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('calves')}
              onKeyDown={(e) => e.key === 'Enter' && tap('calves')}
            />
          </svg>
        </div>

        <div className="relative shrink-0">
          <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-wider text-gray-600">
            Back
          </span>
          <svg width={140} height={260} viewBox="0 0 140 260" className="overflow-visible">
            <ellipse cx={70} cy={22} rx={18} ry={20} fill="#1a1a28" stroke="#2e2e3e" strokeWidth={1} />
            <ellipse
              role="button"
              tabIndex={0}
              cx={70}
              cy={52}
              rx={44}
              ry={14}
              fill={sorenessFill(value.shoulders ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('shoulders')}
              onKeyDown={(e) => e.key === 'Enter' && tap('shoulders')}
            />
            <rect
              role="button"
              tabIndex={0}
              x={38}
              y={68}
              width={64}
              height={56}
              rx={12}
              fill={sorenessFill(value.back ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('back')}
              onKeyDown={(e) => e.key === 'Enter' && tap('back')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={32}
              cy={88}
              rx={11}
              ry={30}
              fill={sorenessFill(value.triceps ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('triceps')}
              onKeyDown={(e) => e.key === 'Enter' && tap('triceps')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={108}
              cy={88}
              rx={11}
              ry={30}
              fill={sorenessFill(value.triceps ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('triceps')}
              onKeyDown={(e) => e.key === 'Enter' && tap('triceps')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={70}
              cy={118}
              rx={28}
              ry={20}
              fill={sorenessFill(value.glutes ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('glutes')}
              onKeyDown={(e) => e.key === 'Enter' && tap('glutes')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={56}
              cy={168}
              rx={17}
              ry={50}
              fill={sorenessFill(value.hamstrings ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('hamstrings')}
              onKeyDown={(e) => e.key === 'Enter' && tap('hamstrings')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={84}
              cy={168}
              rx={17}
              ry={50}
              fill={sorenessFill(value.hamstrings ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('hamstrings')}
              onKeyDown={(e) => e.key === 'Enter' && tap('hamstrings')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={56}
              cy={232}
              rx={14}
              ry={22}
              fill={sorenessFill(value.calves ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('calves')}
              onKeyDown={(e) => e.key === 'Enter' && tap('calves')}
            />
            <ellipse
              role="button"
              tabIndex={0}
              cx={84}
              cy={232}
              rx={14}
              ry={22}
              fill={sorenessFill(value.calves ?? 0)}
              stroke="#3f3f5a"
              strokeWidth={1}
              className="cursor-pointer outline-none hover:opacity-90"
              onClick={() => tap('calves')}
              onKeyDown={(e) => e.key === 'Enter' && tap('calves')}
            />
          </svg>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2 text-[11px]">
        {RECOVERY_MUSCLE_GROUPS.map((m) => (
          <li
            key={m}
            className="rounded-lg border border-[#2e2e3e] bg-[#0f0f1a] px-2 py-1 capitalize text-gray-400"
          >
            {m}: <span className="font-mono font-bold text-white">{value[m] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
