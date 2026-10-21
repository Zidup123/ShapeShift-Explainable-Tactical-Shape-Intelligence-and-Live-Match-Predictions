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

const ZONE_BANDS: { name: string; yStart: number; yEnd: number }[] = [
  { name: 'L_wide',  yStart: 0,   yEnd: 104 },
  { name: 'L_half',  yStart: 104, yEnd: 208 },
  { name: 'central', yStart: 208, yEnd: 312 },
  { name: 'R_half',  yStart: 312, yEnd: 416 },
  { name: 'R_wide',  yStart: 416, yEnd: 520 },
]

// Line draw order: DEF → MID → FWD (within each team's half, sorted by y)
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

const LINE_COLORS: Record<string, string> = {
  DEF: 'rgba(96,165,250,0.55)',   // blue tint
  MID: 'rgba(167,139,250,0.55)',  // purple tint
  FWD: 'rgba(251,146,60,0.55)',   // orange tint
}

export default function PitchView({ state, homeTeamId, homeName, awayName }: PitchViewProps) {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  const possessionTeam = state?.possession_team ?? ''
  const isPossHome = possessionTeam === homeTeamId

  const homeLines = state ? buildFormationLines(state.players, homeTeamId) : []
  const awayId = state?.players.find(p => p.team_id !== homeTeamId)?.team_id ?? ''
  const awayLines = state && awayId ? buildFormationLines(state.players, awayId) : []

  // Shape labels from state
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

      {/* ── Attacking direction arrows ── */}
      {/* Home attacks right → */}
      <g opacity="0.5">
        <text x={W/2 - 60} y={H - 10} textAnchor="middle" fontSize={9} fill="#60a5fa" fontWeight="bold">
          {homeName ?? 'HOME'} ▶
        </text>
        <text x={W/2 + 60} y={H - 10} textAnchor="middle" fontSize={9} fill="#f87171" fontWeight="bold">
          ◀ {awayName ?? 'AWAY'}
        </text>
      </g>

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

      {/* ── Overload zones ── */}
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
            {oz.overload !== 0 && (
              <g>
                {/* Attackers vs defenders badge */}
                <rect x={492} y={midY - 11} width={60} height={22} rx={4}
                  fill={isOverload ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'} />
                <text x={522} y={midY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fontWeight="bold"
                  fill={isOverload ? '#86efac' : '#fca5a5'}>
                  {oz.attackers}v{oz.defenders}
                </text>
                {/* Overload delta */}
                <text x={790} y={midY} textAnchor="end" dominantBaseline="middle"
                  fontSize={14} fontWeight="bold"
                  fill={isOverload ? '#4ade80' : '#f87171'}>
                  {isOverload ? `+${oz.overload}` : oz.overload}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* ── "Attacking third" label ── */}
      <text x={640} y={36} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.25)" letterSpacing="2">
        ATTACKING THIRD
      </text>

      {/* ── Formation lines — HOME ── */}
      {homeLines.map(({ line, points }) => (
        <polyline
          key={`home-line-${line}`}
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={LINE_COLORS[line]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* ── Formation lines — AWAY ── */}
      {awayLines.map(({ line, points }) => {
        const awayLineColors: Record<string, string> = {
          DEF: 'rgba(252,165,165,0.55)',
          MID: 'rgba(216,180,254,0.55)',
          FWD: 'rgba(253,186,116,0.55)',
        }
        return (
          <polyline
            key={`away-line-${line}`}
            points={points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={awayLineColors[line] ?? 'rgba(255,255,255,0.3)'}
            strokeWidth="2"
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

            {/* Player name tooltip */}
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

      {/* ── Possession team indicator ── */}
      {state && (
        <g>
          <rect x={W/2 - 52} y={4} width={104} height={16} rx={4} fill="rgba(0,0,0,0.6)" />
          <text x={W/2} y={12} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill={isPossHome ? '#93c5fd' : '#fca5a5'} fontWeight="bold">
            {isPossHome ? (homeName ?? 'HOME') : (awayName ?? 'AWAY')} IN POSSESSION
          </text>
        </g>
      )}

      {/* ── Score overlay ── */}
      {state && (state.home_goals > 0 || state.away_goals > 0) && (
        <g>
          <rect x={W - 64} y={4} width={60} height={16} rx={4} fill="rgba(0,0,0,0.65)" />
          <text x={W - 34} y={12} textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fill="white" fontWeight="bold">
            {state.home_goals} – {state.away_goals}
          </text>
        </g>
      )}

      {/* ── Rest defence badge ── */}
      {(() => {
        const restCount = state?.overloads.reduce((acc, oz) => Math.max(acc, oz.rest_defence ?? 0), 0) ?? 0
        if (!state || restCount === 0) return null
        const isLow = restCount <= 3
        return (
          <g>
            <rect x={10} y={232} width={80} height={18} rx={4}
              fill={isLow ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.6)'} />
            <text x={50} y={241} textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fill={isLow ? '#fca5a5' : '#d1d5db'}>
              Rest def: {restCount}{isLow ? ' ⚠' : ''}
            </text>
          </g>
        )
      })()}

      {/* ── Line legend (bottom-left) ── */}
      {state && (
        <g>
          {(['DEF', 'MID', 'FWD'] as const).map((ln, i) => (
            <g key={ln}>
              <line x1={10} y1={H - 30 + i * 10} x2={22} y2={H - 30 + i * 10}
                stroke={LINE_COLORS[ln]} strokeWidth="2" />
              <text x={26} y={H - 30 + i * 10} dominantBaseline="middle"
                fontSize={8} fill="rgba(255,255,255,0.45)">{ln}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}
