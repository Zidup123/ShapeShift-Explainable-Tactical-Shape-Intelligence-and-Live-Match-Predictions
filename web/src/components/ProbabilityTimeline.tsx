import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { PredictionPoint } from '../types'

interface ProbabilityTimelineProps {
  predictions: PredictionPoint[]
  currentMinute: number
  homeName?: string
  awayName?: string
}

export default function ProbabilityTimeline({
  predictions,
  currentMinute,
  homeName = 'Home',
  awayName = 'Away',
}: ProbabilityTimelineProps) {
  return (
    <div className="rounded-lg p-3 border border-gray-700" style={{ background: '#111827' }}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Next-goal probability</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={predictions} margin={{ top: 4, right: 8, bottom: 4, left: -22 }}>
          <XAxis
            dataKey="minute"
            domain={[1, 90]}
            tick={{ fontSize: 9, fill: '#6b7280' }}
            tickCount={10}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 9, fill: '#6b7280' }}
            tickCount={5}
            tickFormatter={v => `${Math.round(v * 100)}%`}
          />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 10 }}
            labelFormatter={v => `Min ${v}`}
            formatter={(v: number, name: string) => [`${(v * 100).toFixed(1)}%`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
            formatter={(_value, entry) => (
              <span style={{ color: entry.color, fontSize: 9 }}>{entry.value}</span>
            )}
          />
          <ReferenceLine x={currentMinute} stroke="#4b5563" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="p_next_goal_home"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
            name={homeName}
          />
          <Line
            type="monotone"
            dataKey="p_next_goal_away"
            stroke="#ef4444"
            dot={false}
            strokeWidth={2}
            name={awayName}
          />
          <Line
            type="monotone"
            dataKey="counter_risk"
            stroke="#f97316"
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            name="Counter"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
