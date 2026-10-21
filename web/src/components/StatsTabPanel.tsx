import { useState } from 'react'
import { LiveStatPoint, PredictionPoint } from '../types'

interface StatsTabPanelProps {
  stats: LiveStatPoint | null
  prediction: PredictionPoint | null
  homeName: string
  awayName: string
}

// Reusable split-bar stat row used in the Stats tab
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

// Counter-risk gauge shown in the Prediction tab
function RiskGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value < 0.3 ? '#22c55e' : value < 0.6 ? '#f97316' : '#ef4444'
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span className="uppercase tracking-wider">Counter risk</span>
        <span style={{ color }} className="font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

type TabId = 'stats' | 'prediction'

export default function StatsTabPanel({ stats, prediction, homeName, awayName }: StatsTabPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('stats')

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden" style={{ background: '#111827' }}>
      {/* Tab row */}
      <div className="flex border-b border-gray-700">
        {(['stats', 'prediction'] as TabId[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-500 bg-transparent'
                : 'text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            {tab === 'stats' ? 'Stats' : 'Prediction'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {/* ── Stats tab — mirrors MatchStatsBar content ── */}
        {activeTab === 'stats' && (
          <>
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
          </>
        )}

        {/* ── Prediction tab — mirrors PredictionMeter content ── */}
        {activeTab === 'prediction' && (
          <>
            {prediction ? (
              <>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
                  Next goal probability
                </div>

                {/* Next-goal split bar */}
                {(() => {
                  const homeP = prediction.p_next_goal_home
                  const awayP = prediction.p_next_goal_away
                  const total = homeP + awayP || 1
                  const homePct = Math.round((homeP / total) * 100)
                  const awayPct = 100 - homePct
                  return (
                    <>
                      <div className="flex h-7 rounded-lg overflow-hidden mb-2">
                        <div
                          className="flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                          style={{ width: `${homePct}%`, background: '#1d4ed8' }}
                        >
                          {homePct > 15 ? `${homePct}%` : ''}
                        </div>
                        <div
                          className="flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                          style={{ width: `${awayPct}%`, background: '#b91c1c' }}
                        >
                          {awayPct > 15 ? `${awayPct}%` : ''}
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] mb-2">
                        <span className="text-blue-400 truncate max-w-[90px]">{homeName}</span>
                        <span className="text-red-400 truncate max-w-[90px] text-right">{awayName}</span>
                      </div>
                    </>
                  )
                })()}

                {/* xG next 15 minutes */}
                <div className="flex justify-between text-[10px] text-gray-400 pt-2 border-t border-gray-800">
                  <span>xG next 15: <span className="text-blue-300">{prediction.xg_next_15_home.toFixed(2)}</span></span>
                  <span>xG next 15: <span className="text-red-300">{prediction.xg_next_15_away.toFixed(2)}</span></span>
                </div>

                <RiskGauge value={prediction.counter_risk} />
              </>
            ) : (
              <p className="text-gray-600 text-xs text-center py-4">No predictions yet</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
