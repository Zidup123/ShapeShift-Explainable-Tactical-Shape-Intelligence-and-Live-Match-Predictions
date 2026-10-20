import { LiveStatPoint } from '../types'

interface MatchStatsBarProps {
  stats: LiveStatPoint | null
  homeName: string
  awayName: string
}

function Stat({
  label,
  homeVal,
  awayVal,
  homeColor,
  awayColor,
  format,
}: {
  label: string
  homeVal: number
  awayVal: number
  homeColor: string
  awayColor: string
  format: (v: number) => string
}) {
  const total = homeVal + awayVal || 1
  const homePct = (homeVal / total) * 100

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: homeColor }} className="font-semibold">{format(homeVal)}</span>
        <span className="text-gray-400 uppercase tracking-wider text-[10px]">{label}</span>
        <span style={{ color: awayColor }} className="font-semibold">{format(awayVal)}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
        <div style={{ width: `${homePct}%`, background: homeColor }} className="transition-all duration-500" />
        <div style={{ width: `${100 - homePct}%`, background: awayColor }} className="transition-all duration-500" />
      </div>
    </div>
  )
}

export default function MatchStatsBar({ stats, homeName, awayName }: MatchStatsBarProps) {
  return (
    <div className="rounded-lg p-3 border border-gray-700" style={{ background: '#111827' }}>
      <div className="flex justify-between text-[11px] mb-3">
        <span className="text-blue-400 font-semibold truncate max-w-[80px]">{homeName}</span>
        <span className="text-gray-400 uppercase tracking-wider text-[10px]">Live stats</span>
        <span className="text-red-400 font-semibold truncate max-w-[80px] text-right">{awayName}</span>
      </div>

      {stats ? (
        <>
          <Stat
            label="xG"
            homeVal={stats.xg_home}
            awayVal={stats.xg_away}
            homeColor="#3b82f6"
            awayColor="#ef4444"
            format={v => v.toFixed(2)}
          />
          <Stat
            label="Shots"
            homeVal={stats.shots_home}
            awayVal={stats.shots_away}
            homeColor="#3b82f6"
            awayColor="#ef4444"
            format={v => String(v)}
          />
          <Stat
            label="Poss %"
            homeVal={stats.poss_pct_home}
            awayVal={1 - stats.poss_pct_home}
            homeColor="#3b82f6"
            awayColor="#ef4444"
            format={v => `${Math.round(v * 100)}%`}
          />
        </>
      ) : (
        <p className="text-gray-600 text-xs text-center py-2">No data yet</p>
      )}
    </div>
  )
}
