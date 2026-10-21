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
      <defs>
        <style>{`
          @keyframes shotPulse {
            0%   { r: 10; opacity: 0.9; }
            60%  { r: 22; opacity: 0.5; }
            100% { r: 32; opacity: 0; }
          }
          .shot-marker { animation: shotPulse 1.8s ease-out forwards; }
        `}</style>
      </defs>

      {/* Pitch fill */}
      <rect x="0" y="0" width="800" height="520" fill="#1a5c2a" />
      {[0, 2, 4, 6].map(i => (
        <rect key={i} x={i * 100} y="0" width="100" height="520" fill="rgba(0,0,0,0.05)" />
      ))}

      {/* Pitch markings */}
      <rect x="2" y="2" width="796" height="516" fill="none" stroke="white" strokeWidth="2" />
      <line x1="400" y1="2" x2="400" y2="518" stroke="white" strokeWidth="1.5" />
      <circle cx="400" cy="260" r="73" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="400" cy="260" r="3" fill="white" />
      <rect x="2" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="2" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="0" y="221" width="4" height="78" fill="white" />
      <rect x="678" y="130" width="120" height="260" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="758" y="195" width="40" height="130" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="796" y="221" width="4" height="78" fill="white" />
      <circle cx="88" cy="260" r="3" fill="white" />
      <circle cx="712" cy="260" r="3" fill="white" />

      {/* Overload zones with labels */}
      {state?.overloads.map((oz, i) => {
        const band = ZONE_BANDS.find(b => b.name === oz.zone)
        if (!band) return null
        const fill = oz.overload > 0 ? 'rgba(34,197,94,0.25)' : oz.overload < 0 ? 'rgba(239,68,68,0.2)' : 'transparent'
        const midY = (band.yStart + band.yEnd) / 2
        return (
          <g key={i}>
            <rect x={480} y={band.yStart} width={320} height={band.yEnd - band.yStart} fill={fill} />
            {oz.overload !== 0 && (
              <text x={790} y={midY} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight="bold"
                fill={oz.overload > 0 ? '#86efac' : '#fca5a5'} style={{ pointerEvents: 'none' }}>
                {oz.overload > 0 ? `+${oz.overload}` : oz.overload}
              </text>
            )}
          </g>
        )
      })}

      {/* Shot event markers — animate outward ring on mount */}
      {state?.minute_events?.filter(e => e.type === 'shot').map((ev, i) => {
        const cx = toSvgX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toSvgY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        const isGoal = ev.outcome === 'goal'
        const color = ev.team_id === homeTeamId ? '#60a5fa' : '#f87171'
        return (
          <g key={`shot-${i}-${state.minute}`}>
            <circle className="shot-marker" cx={cx} cy={cy} r={10} fill="none" stroke={isGoal ? '#facc15' : color} strokeWidth={isGoal ? 3 : 2} />
            {isGoal && (
              <text x={cx} y={cy - 20} textAnchor="middle" fontSize={11} fill="#facc15" fontWeight="bold">GOAL</text>
            )}
          </g>
        )
      })}

      {/* Counter event markers */}
      {state?.minute_events?.filter(e => e.is_counter).map((ev, i) => {
        const cx = toSvgX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toSvgY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        return (
          <g key={`counter-${i}-${state.minute}`}>
            <text x={cx} y={cy - 14} textAnchor="middle" fontSize={9} fill="#f97316" fontWeight="bold">COUNTER</text>
          </g>
        )
      })}

      {/* Players — smooth animation via CSS transform translate */}
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
            style={{
              transform: `translate(${cx}px, ${cy}px)`,
              transition: 'transform 0.65s ease-in-out',
            }}
            onMouseEnter={() => setHoveredPlayer(p.player_id)}
            onMouseLeave={() => setHoveredPlayer(null)}
          >
            <circle r={r} fill={color} stroke={isHovered ? '#facc15' : 'white'} strokeWidth={isHovered ? 2.5 : 1.5} />
            <text textAnchor="middle" dominantBaseline="middle" y={1} fontSize={p.is_gk ? 9 : 8} fill="white" fontWeight="bold" style={{ pointerEvents: 'none' }}>
              {slotLabel}
            </text>
            {isHovered && p.name && p.name !== p.player_id && (
              <g>
                <rect x={-36} y={-r - 22} width={72} height={16} rx={3} fill="rgba(0,0,0,0.85)" />
                <text x={0} y={-r - 13} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="white" style={{ pointerEvents: 'none' }}>
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
          style={{ transition: 'cx 0.65s ease-in-out, cy 0.65s ease-in-out' }}
        />
      )}

      {/* Rest defence badge */}
      {(() => {
        const restCount = state?.overloads.reduce((acc, oz) => Math.max(acc, oz.rest_defence ?? 0), 0) ?? 0
        if (!state || restCount === 0) return null
        return (
          <g>
            <rect x={10} y={240} width={70} height={20} rx={4} fill="rgba(0,0,0,0.7)" />
            <text x={45} y={250} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#d1d5db">
              Rest def: {restCount}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
