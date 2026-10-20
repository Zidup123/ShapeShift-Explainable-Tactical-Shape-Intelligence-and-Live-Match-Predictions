import { Prediction } from '../types'

interface PredictionMeterProps {
  prediction: Prediction | null
  homeName: string
  awayName: string
}

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

export default function PredictionMeter({ prediction, homeName, awayName }: PredictionMeterProps) {
  if (!prediction) {
    return (
      <div className="rounded-lg p-3 border border-gray-700 text-xs text-gray-600 text-center" style={{ background: '#111827' }}>
        No predictions yet
      </div>
    )
  }

  const homeP = prediction.p_next_goal_home
  const awayP = prediction.p_next_goal_away
  const total = homeP + awayP || 1
  const homePct = Math.round((homeP / total) * 100)
  const awayPct = 100 - homePct

  return (
    <div className="rounded-lg p-3 border border-gray-700" style={{ background: '#111827' }}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Next goal probability</div>

      {/* Split bar */}
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

      <div className="flex justify-between text-[10px]">
        <span className="text-blue-400 truncate max-w-[90px]">{homeName}</span>
        <span className="text-red-400 truncate max-w-[90px] text-right">{awayName}</span>
      </div>

      {/* xG next 15 */}
      <div className="flex justify-between text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-800">
        <span>xG next 15: <span className="text-blue-300">{prediction.xg_next_15_home.toFixed(2)}</span></span>
        <span>xG next 15: <span className="text-red-300">{prediction.xg_next_15_away.toFixed(2)}</span></span>
      </div>

      <RiskGauge value={prediction.counter_risk} />
    </div>
  )
}
