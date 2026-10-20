import React from 'react'
import { MatchState } from '../types'

interface PitchViewProps {
  state: MatchState | null
  homeTeamId: string
}

// Convert 0-100 coordinates to SVG pixel space
const toSvgX = (x: number) => Math.max(0, Math.min(800, (x / 100) * 800))
const toSvgY = (y: number) => Math.max(0, Math.min(520, (y / 100) * 520))

// Zone y-band boundaries (5 equal zones across the pitch height)
const ZONE_BANDS: { name: string; yStart: number; yEnd: number }[] = [
  { name: 'L_wide',      yStart: 0,   yEnd: 104 },
  { name: 'L_half',      yStart: 104, yEnd: 208 },
  { name: 'central',     yStart: 208, yEnd: 312 },
  { name: 'R_half',      yStart: 312, yEnd: 416 },
  { name: 'R_wide',      yStart: 416, yEnd: 520 },
]

export default function PitchView({ state, homeTeamId }: PitchViewProps) {
  return (
    <svg
      viewBox="0 0 800 520"
      className="w-full"
      style={{ background: '#1a5c2a', display: 'block' }}
    >
      {/* Pitch outline */}
      <rect x="0" y="0" width="800" height="520" fill="#1a5c2a" />
      <rect x="2" y="2" width="796" height="516" fill="none" stroke="white" strokeWidth="2" />

      {/* Halfway line */}
      <line x1="400" y1="2" x2="400" y2="518" stroke="white" strokeWidth="1.5" />

      {/* Centre circle */}
      <circle cx="400" cy="260" r="73" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="400" cy="260" r="3" fill="white" />

      {/* Left penalty area */}
      <rect x="2" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Left 6-yard box */}
      <rect x="2" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Left goal */}
      <rect x="0" y="221" width="4" height="78" fill="white" />

      {/* Right penalty area */}
      <rect x="678" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Right 6-yard box */}
      <rect x="758" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      {/* Right goal */}
      <rect x="796" y="221" width="4" height="78" fill="white" />

      {/* Penalty spots */}
      <circle cx="88" cy="260" r="3" fill="white" />
      <circle cx="712" cy="260" r="3" fill="white" />

      {/* Overload zones: drawn in final third (x > 60 → SVG x > 480) */}
      {state?.overloads.map((oz, i) => {
        const band = ZONE_BANDS.find(b => b.name === oz.zone)
        if (!band) return null
        let fillColor = 'transparent'
        if (oz.overload > 0) fillColor = 'rgba(34,197,94,0.3)'
        else if (oz.overload < 0) fillColor = 'rgba(239,68,68,0.2)'
        return (
          <rect
            key={i}
            x={480}
            y={band.yStart}
            width={320}
            height={band.yEnd - band.yStart}
            fill={fillColor}
          />
        )
      })}

      {/* Players */}
      {state?.players.map((p) => {
        const cx = toSvgX(p.x)
        const cy = toSvgY(p.y)
        const isHome = p.team_id === homeTeamId
        const color = isHome ? '#3b82f6' : '#ef4444'
        const r = p.is_gk ? 14 : 10

        // Slot label from player_id suffix (last two chars as number)
        const slotMatch = p.player_id.match(/(\d+)$/)
        const slotLabel = slotMatch ? String(parseInt(slotMatch[1], 10)) : '?'

        return (
          <g key={p.player_id}>
            <circle cx={cx} cy={cy} r={r} fill={color} stroke="white" strokeWidth="1.5" />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={p.is_gk ? 9 : 8}
              fill="white"
              fontWeight="bold"
            >
              {slotLabel}
            </text>
          </g>
        )
      })}

      {/* Ball */}
      {state && (
        <circle
          cx={toSvgX(state.ball_x)}
          cy={toSvgY(state.ball_y)}
          r={6}
          fill="white"
          stroke="#333"
          strokeWidth="1"
        />
      )}
    </svg>
  )
}
