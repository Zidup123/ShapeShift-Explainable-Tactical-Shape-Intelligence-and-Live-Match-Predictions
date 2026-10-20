import { useState } from 'react'
import { MatchState } from '../types'

interface PitchViewProps {
  state: MatchState | null
  homeTeamId: string
}

const toSvgX = (x: number) => Math.max(0, Math.min(800, (x / 100) * 800))
const toSvgY = (y: number) => Math.max(0, Math.min(520, (y / 100) * 520))

const ZONE_BANDS: { name: string; yStart: number; yEnd: number }[] = [
  { name: 'L_wide',  yStart: 0,   yEnd: 104 },
  { name: 'L_half',  yStart: 104, yEnd: 208 },
  { name: 'central', yStart: 208, yEnd: 312 },
  { name: 'R_half',  yStart: 312, yEnd: 416 },
  { name: 'R_wide',  yStart: 416, yEnd: 520 },
]

export default function PitchView({ state, homeTeamId }: PitchViewProps) {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  return (
    <svg
      viewBox="0 0 800 520"
      className="w-full"
      style={{ background: '#1a5c2a', display: 'block' }}
    >
      {/* Pitch fill */}
      <rect x="0" y="0" width="800" height="520" fill="#1a5c2a" />
      {/* Alternate stripe bands for depth */}
      {[0, 2, 4, 6].map(i => (
        <rect key={i} x={i * 100} y="0" width="100" height="520" fill="rgba(0,0,0,0.05)" />
      ))}

      {/* Pitch outline */}
      <rect x="2" y="2" width="796" height="516" fill="none" stroke="white" strokeWidth="2" />

      {/* Halfway line */}
      <line x1="400" y1="2" x2="400" y2="518" stroke="white" strokeWidth="1.5" />

      {/* Centre circle */}
      <circle cx="400" cy="260" r="73" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="400" cy="260" r="3" fill="white" />

      {/* Left penalty area */}
      <rect x="2" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="2" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="0" y="221" width="4" height="78" fill="white" />

      {/* Right penalty area */}
      <rect x="678" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="758" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="796" y="221" width="4" height="78" fill="white" />

      {/* Penalty spots */}
      <circle cx="88" cy="260" r="3" fill="white" />
      <circle cx="712" cy="260" r="3" fill="white" />

      {/* Overload zones: drawn in attacking third (x > 60 → SVG x > 480) */}
      {state?.overloads.map((oz, i) => {
        const band = ZONE_BANDS.find(b => b.name === oz.zone)
        if (!band) return null
        let fillColor = 'transparent'
        if (oz.overload > 0) fillColor = 'rgba(34,197,94,0.25)'
        else if (oz.overload < 0) fillColor = 'rgba(239,68,68,0.2)'
        const midY = (band.yStart + band.yEnd) / 2
        return (
          <g key={i}>
            <rect
              x={480}
              y={band.yStart}
              width={320}
              height={band.yEnd - band.yStart}
              fill={fillColor}
            />
            {oz.overload !== 0 && (
              <text
                x={790}
                y={midY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={13}
                fontWeight="bold"
                fill={oz.overload > 0 ? '#86efac' : '#fca5a5'}
                style={{ pointerEvents: 'none' }}
              >
                {oz.overload > 0 ? `+${oz.overload}` : oz.overload}
              </text>
            )}
          </g>
        )
      })}

      {/* Players */}
      {state?.players.map((p) => {
        const cx = toSvgX(p.x)
        const cy = toSvgY(p.y)
        const isHome = p.team_id === homeTeamId
        const color = isHome ? '#3b82f6' : '#ef4444'
        const r = p.is_gk ? 14 : 10
        const slotMatch = p.player_id.match(/(\d+)$/)
        const slotLabel = slotMatch ? String(parseInt(slotMatch[1], 10)) : '?'
        const isHovered = hoveredPlayer === p.player_id

        return (
          <g
            key={p.player_id}
            onMouseEnter={() => setHoveredPlayer(p.player_id)}
            onMouseLeave={() => setHoveredPlayer(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={cx} cy={cy} r={r} fill={color} stroke={isHovered ? 'yellow' : 'white'} strokeWidth={isHovered ? 2.5 : 1.5} />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={p.is_gk ? 9 : 8}
              fill="white"
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {slotLabel}
            </text>
            {/* Name tooltip on hover */}
            {isHovered && p.name && p.name !== p.player_id && (
              <g>
                <rect
                  x={cx - 36}
                  y={cy - r - 22}
                  width={72}
                  height={16}
                  rx={3}
                  fill="rgba(0,0,0,0.85)"
                />
                <text
                  x={cx}
                  y={cy - r - 13}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="white"
                  style={{ pointerEvents: 'none' }}
                >
                  {p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}
                </text>
              </g>
            )}
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

      {/* Rest defence count badge */}
      {(() => {
        const restCount = state?.overloads.reduce((acc, oz) => Math.max(acc, oz.rest_defence ?? 0), 0) ?? 0
        if (!state || restCount === 0) return null
        return (
          <g>
            <rect x={10} y={240} width={64} height={20} rx={4} fill="rgba(0,0,0,0.7)" />
            <text x={42} y={250} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#d1d5db">
              Rest def: {restCount}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
