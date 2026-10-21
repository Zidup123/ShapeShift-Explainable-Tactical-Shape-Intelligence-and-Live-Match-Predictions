import { useState } from 'react'
import { MatchState, Player } from '../types'

interface PitchViewProps {
  state: MatchState | null
  homeTeamId: string
  homeName?: string
  awayName?: string
}

const W = 800
const H = 520

const toSvgX = (x: number) => Math.max(0, Math.min(W, (x / 100) * W))
const toSvgY = (y: number) => Math.max(0, Math.min(H, (y / 100) * H))

// Zone bands used for overload highlighting (y-axis bands across the pitch)
const ZONE_BANDS: { name: string; yStart: number; yEnd: number }[] = [
  { name: 'L_wide',  yStart: 0,   yEnd: 104 },
  { name: 'L_half',  yStart: 104, yEnd: 208 },
  { name: 'central', yStart: 208, yEnd: 312 },
  { name: 'R_half',  yStart: 312, yEnd: 416 },
  { name: 'R_wide',  yStart: 416, yEnd: 520 },
]

// Draw formation lines in DEF → MID → FWD order
const LINE_ORDER = ['DEF', 'MID', 'FWD']

function buildFormationLines(players: Player[], teamId: string): { line: string; points: [number, number][] }[] {
  const outfield = players.filter(p => p.team_id === teamId && !p.is_gk)
  const groups: Record<string, Player[]> = { DEF: [], MID: [], FWD: [] }
  for (const p of outfield) {
    const ln = p.line === 'GK' ? 'DEF' : p.line
    if (groups[ln]) groups[ln].push(p)
  }
  return LINE_ORDER
    .filter(ln => groups[ln].length >= 2)
    .map(ln => ({
      line: ln,
      // Sort by y so the connecting line runs left-to-right across the pitch
      points: groups[ln]
        .sort((a, b) => a.y - b.y)
        .map(p => [toSvgX(p.x), toSvgY(p.y)] as [number, number]),
    }))
}

// Subtle line colours per phase — opacity kept low to avoid clutter
const LINE_COLORS: Record<string, string> = {
  DEF: 'rgba(96,165,250,0.4)',
  MID: 'rgba(167,139,250,0.4)',
  FWD: 'rgba(251,146,60,0.4)',
}

export default function PitchView({ state, homeTeamId, homeName, awayName }: PitchViewProps) {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  const possessionTeam = state?.possession_team ?? ''
  const isPossHome = possessionTeam === homeTeamId

  const homeLines = state ? buildFormationLines(state.players, homeTeamId) : []
  const awayId = state?.players.find(p => p.team_id !== homeTeamId)?.team_id ?? ''
  const awayLines = state && awayId ? buildFormationLines(state.players, awayId) : []

  // Formation shape labels
  const homeShape = state?.shapes.home.in_possession ?? ''
  const awayShape = state?.shapes.away.in_possession ?? ''

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ background: '#1a5c2a', display: 'block' }}
    >
      <defs>
        <style>{`
          @keyframes shotPulse {
            0%   { r: 10; opacity: 0.9; }
            60%  { r: 26; opacity: 0.45; }
            100% { r: 38; opacity: 0; }
          }
          .shot-marker { animation: shotPulse 2s ease-out forwards; }
          @keyframes possGlow {
            0%, 100% { opacity: 0.35; }
            50%       { opacity: 0.65; }
          }
          .poss-ring { animation: possGlow 1.4s ease-in-out infinite; }
        `}</style>
        <filter id="glow-home">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-away">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Pitch surface ── */}
      <rect x="0" y="0" width={W} height={H} fill="#1a5c2a" />
      {/* Subtle stripe bands */}
      {[0, 2, 4, 6].map(i => (
        <rect key={i} x={i * 100} y="0" width="100" height={H} fill="rgba(0,0,0,0.04)" />
      ))}

      {/* ── Pitch markings ── */}
      <rect x="2" y="2" width={W - 4} height={H - 4} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <line x1={W/2} y1="2" x2={W/2} y2={H - 2} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
      <circle cx={W/2} cy={H/2} r="73" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
      <circle cx={W/2} cy={H/2} r="4" fill="rgba(255,255,255,0.7)" />
      {/* Left box */}
      <rect x="2" y="130" width="120" height="260" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x="2" y="195" width="40" height="130" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x="0" y="221" width="4" height="78" fill="rgba(255,255,255,0.8)" />
      {/* Right box */}
      <rect x={W - 122} y="130" width="120" height="260" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x={W - 42} y="195" width="40" height="130" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x={W - 4} y="221" width="4" height="78" fill="rgba(255,255,255,0.8)" />
      {/* Penalty spots */}
      <circle cx="88" cy={H/2} r="3" fill="rgba(255,255,255,0.7)" />
      <circle cx={W - 88} cy={H/2} r="3" fill="rgba(255,255,255,0.7)" />

      {/* ── Formation name labels ── */}
      {homeShape && (
        <text x={W/4} y={22} textAnchor="middle" fontSize={11} fill="rgba(147,197,253,0.8)" fontWeight="bold" letterSpacing="1">
          {homeShape}
        </text>
      )}
      {awayShape && (
        <text x={3*W/4} y={22} textAnchor="middle" fontSize={11} fill="rgba(252,165,165,0.8)" fontWeight="bold" letterSpacing="1">
          {awayShape}
        </text>
      )}

      {/* ── Possession indicator — small pill badge at top-centre ── */}
      {state && (
        <g>
          <rect x={W/2 - 46} y={4} width={92} height={15} rx={7}
            fill={isPossHome ? 'rgba(29,78,216,0.75)' : 'rgba(185,28,28,0.75)'} />
          <text x={W/2} y={12} textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fill="white" fontWeight="bold">
            {isPossHome ? '▶' : '◀'} {isPossHome ? (homeName ?? 'HOME') : (awayName ?? 'AWAY')}
          </text>
        </g>
      )}

      {/* ── Overload zones — show only the delta badge (+N / -N) ── */}
      {state?.overloads.map((oz, i) => {
        const band = ZONE_BANDS.find(b => b.name === oz.zone)
        if (!band) return null
        const midY = (band.yStart + band.yEnd) / 2
        const isOverload = oz.overload > 0
        const isUnderload = oz.overload < 0
        const fill = isOverload
          ? 'rgba(34,197,94,0.22)'
          : isUnderload ? 'rgba(239,68,68,0.18)' : 'transparent'
        const borderColor = isOverload ? 'rgba(34,197,94,0.4)' : isUnderload ? 'rgba(239,68,68,0.35)' : 'transparent'

        return (
          <g key={i}>
            <rect x={480} y={band.yStart} width={320} height={band.yEnd - band.yStart}
              fill={fill} stroke={borderColor} strokeWidth="1" />
            {/* Show only the delta number — no attacker-vs-defender badge */}
            {oz.overload !== 0 && (
              <text x={790} y={midY} textAnchor="end" dominantBaseline="middle"
                fontSize={14} fontWeight="bold"
                fill={isOverload ? '#4ade80' : '#f87171'}>
                {isOverload ? `+${oz.overload}` : oz.overload}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Formation lines — HOME (thinner, more transparent) ── */}
      {homeLines.map(({ line, points }) => (
        <polyline
          key={`home-line-${line}`}
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={LINE_COLORS[line]}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* ── Formation lines — AWAY (thinner, more transparent) ── */}
      {awayLines.map(({ line, points }) => {
        const awayLineColors: Record<string, string> = {
          DEF: 'rgba(252,165,165,0.4)',
          MID: 'rgba(216,180,254,0.4)',
          FWD: 'rgba(253,186,116,0.4)',
        }
        return (
          <polyline
            key={`away-line-${line}`}
            points={points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={awayLineColors[line] ?? 'rgba(255,255,255,0.25)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* ── Shot event markers ── */}
      {state?.minute_events?.filter(e => e.type === 'shot').map((ev, i) => {
        const cx = toSvgX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toSvgY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        const isGoal = ev.outcome === 'goal'
        const color = ev.team_id === homeTeamId ? '#60a5fa' : '#f87171'
        return (
          <g key={`shot-${i}-${state.minute}`}>
            <circle className="shot-marker" cx={cx} cy={cy} r={10}
              fill="none" stroke={isGoal ? '#facc15' : color}
              strokeWidth={isGoal ? 3 : 2} />
            {isGoal && (
              <>
                <rect x={cx - 22} y={cy - 30} width={44} height={16} rx={3} fill="#facc15" />
                <text x={cx} y={cy - 21} textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fill="#000" fontWeight="bold">GOAL</text>
              </>
            )}
          </g>
        )
      })}

      {/* ── Counter markers ── */}
      {state?.minute_events?.filter(e => e.is_counter).map((ev, i) => {
        const cx = toSvgX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toSvgY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        return (
          <g key={`counter-${i}-${state.minute}`}>
            <rect x={cx - 26} y={cy - 20} width={52} height={14} rx={3} fill="rgba(249,115,22,0.85)" />
            <text x={cx} y={cy - 12} textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fill="white" fontWeight="bold">COUNTER</text>
          </g>
        )
      })}

      {/* ── Players ── */}
      {state?.players.map((p) => {
        const cx = toSvgX(p.x)
        const cy = toSvgY(p.y)
        const isHome = p.team_id === homeTeamId
        const isPossessing = p.team_id === possessionTeam
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
            {/* Possession glow ring */}
            {isPossessing && !p.is_gk && (
              <circle className="poss-ring" r={r + 6} fill="none"
                stroke={isHome ? '#93c5fd' : '#fca5a5'} strokeWidth="2" />
            )}

            <circle r={r} fill={color}
              stroke={isHovered ? '#facc15' : 'white'}
              strokeWidth={isHovered ? 2.5 : 1.5}
              filter={isPossessing ? (isHome ? 'url(#glow-home)' : 'url(#glow-away)') : undefined}
            />
            <text textAnchor="middle" dominantBaseline="middle" y={1}
              fontSize={p.is_gk ? 9 : 8} fill="white" fontWeight="bold"
              style={{ pointerEvents: 'none' }}>
              {slotLabel}
            </text>

            {/* Player name tooltip on hover */}
            {isHovered && p.name && p.name !== p.player_id && (
              <g>
                <rect x={-38} y={-r - 24} width={76} height={17} rx={3} fill="rgba(0,0,0,0.9)" />
                <text x={0} y={-r - 15} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="white" style={{ pointerEvents: 'none' }}>
                  {p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name}
                </text>
                <text x={0} y={-r - 5} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fill={isHome ? '#93c5fd' : '#fca5a5'} style={{ pointerEvents: 'none' }}>
                  {p.line}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* ── Ball ── */}
      {state && (
        <circle
          cx={toSvgX(state.ball_x)}
          cy={toSvgY(state.ball_y)}
          r={7}
          fill="white"
          stroke="#555"
          strokeWidth="1.5"
          style={{ transition: 'cx 0.65s ease-in-out, cy 0.65s ease-in-out' }}
        />
      )}

      {/* ── Rest defence badge — only shown when restCount ≤ 4 (vulnerability signal) ── */}
      {(() => {
        const restCount = state?.overloads.reduce((acc, oz) => Math.max(acc, oz.rest_defence ?? 0), 0) ?? 0
        if (!state || restCount === 0 || restCount > 4) return null
        const isLow = restCount <= 3
        return (
          <g>
            <rect x={10} y={232} width={70} height={16} rx={4}
              fill={isLow ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.55)'} />
            <text x={45} y={240} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill={isLow ? '#fca5a5' : '#d1d5db'}>
              Rest def: {restCount}{isLow ? ' ⚠' : ''}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
