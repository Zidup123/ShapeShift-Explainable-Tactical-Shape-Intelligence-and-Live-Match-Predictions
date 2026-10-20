import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PredictionPoint } from '../types'

interface ProbabilityTimelineProps {
  predictions: PredictionPoint[]
  currentMinute: number
}

export default function ProbabilityTimeline({
  predictions,
  currentMinute,
}: ProbabilityTimelineProps) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: '#111827', height: 180 }}
    >
      <div className="text-xs text-gray-400 mb-1">Next-goal probability</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={predictions} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <XAxis
            dataKey="minute"
            domain={[1, 90]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickCount={10}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickCount={6}
          />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: 'none', fontSize: 11 }}
            labelFormatter={v => `Min ${v}`}
          />
          <ReferenceLine x={currentMinute} stroke="#6b7280" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="p_next_goal_home"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
            name="Home"
          />
          <Line
            type="monotone"
            dataKey="p_next_goal_away"
            stroke="#ef4444"
            dot={false}
            strokeWidth={2}
            name="Away"
          />
          <Line
            type="monotone"
            dataKey="counter_risk"
            stroke="#f97316"
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            name="Counter risk"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
