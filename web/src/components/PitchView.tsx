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

const toX = (x: number) => Math.max(0, Math.min(W, (x / 100) * W))
const toY = (y: number) => Math.max(0, Math.min(H, (y / 100) * H))

const ZONE_BANDS = [
  { name: 'L_wide',  yStart: 0,   yEnd: 104 },
  { name: 'L_half',  yStart: 104, yEnd: 208 },
  { name: 'central', yStart: 208, yEnd: 312 },
  { name: 'R_half',  yStart: 312, yEnd: 416 },
  { name: 'R_wide',  yStart: 416, yEnd: 520 },
]

// Smooth cubic bezier spline through an array of [x,y] points
function smoothCurve(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    // Control points at 1/3 and 2/3 between consecutive midpoints
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    if (i === 0) {
      d += ` Q${mx},${my} ${x1},${y1}`
    } else {
      d += ` T${x1},${y1}`
    }
  }
  return d
}

function buildLines(players: Player[], teamId: string) {
  const outfield = players.filter(p => p.team_id === teamId && !p.is_gk)
  const groups: Record<string, Player[]> = { DEF: [], MID: [], FWD: [] }
  for (const p of outfield) {
    const ln = p.line === 'GK' ? 'DEF' : p.line
    if (groups[ln]) groups[ln].push(p)
  }
  return (['DEF', 'MID', 'FWD'] as const)
    .filter(ln => groups[ln].length >= 2)
    .map(ln => ({
      ln,
      pts: groups[ln].sort((a, b) => a.y - b.y).map(p => [toX(p.x), toY(p.y)] as [number, number]),
    }))
}

export default function PitchView({ state, homeTeamId, homeName, awayName }: PitchViewProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const possTeam = state?.possession_team ?? ''
  const isPossHome = possTeam === homeTeamId
  const awayId = state?.players.find(p => p.team_id !== homeTeamId)?.team_id ?? ''

  const homeLines = state ? buildLines(state.players, homeTeamId) : []
  const awayLines = state && awayId ? buildLines(state.players, awayId) : []

  const homeShape = state?.shapes.home.in_possession ?? ''
  const awayShape = state?.shapes.away.in_possession ?? ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ display: 'block' }}>
      <defs>
        {/* ── Animations ── */}
        <style>{`
          @keyframes shotRing {
            0%   { r: 8;  opacity: 1; }
            100% { r: 32; opacity: 0; }
          }
          .shot-ring { animation: shotRing 1.6s ease-out forwards; }
          @keyframes possBreath {
            0%, 100% { opacity: 0.4; r: 13; }
            50%       { opacity: 0.7; r: 15; }
          }
          .poss-ring { animation: possBreath 1.6s ease-in-out infinite; }
        `}</style>

        {/* ── Pitch gradient ── */}
        <linearGradient id="pitch-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1a6130" />
          <stop offset="100%" stopColor="#175629" />
        </linearGradient>

        {/* ── Grass stripe pattern ── */}
        <pattern id="stripes" x="0" y="0" width="100" height={H} patternUnits="userSpaceOnUse">
          <rect x="0"  y="0" width="50"  height={H} fill="rgba(0,0,0,0)" />
          <rect x="50" y="0" width="50"  height={H} fill="rgba(255,255,255,0.03)" />
        </pattern>

        {/* ── Player gradients ── */}
        <radialGradient id="grad-home" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#1e40af" />
        </radialGradient>
        <radialGradient id="grad-away" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#991b1b" />
        </radialGradient>
        <radialGradient id="grad-gk-home" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="grad-gk-away" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#d9f99d" />
          <stop offset="100%" stopColor="#3f6212" />
        </radialGradient>

        {/* ── Ball gradient ── */}
        <radialGradient id="grad-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="65%"  stopColor="#e5e5e5" />
          <stop offset="100%" stopColor="#b0b0b0" />
        </radialGradient>

        {/* ── Filters ── */}
        <filter id="player-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.55)" />
        </filter>
        <filter id="ball-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.5)" />
        </filter>
        <filter id="line-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Pitch surface ── */}
      <rect x="0" y="0" width={W} height={H} fill="url(#pitch-base)" />
      <rect x="0" y="0" width={W} height={H} fill="url(#stripes)" />

      {/* ── Pitch markings ── */}
      {/* Outer border */}
      <rect x="2" y="2" width={W-4} height={H-4} fill="none"
        stroke="rgba(255,255,255,0.75)" strokeWidth="2" rx="1" />
      {/* Halfway */}
      <line x1={W/2} y1="2" x2={W/2} y2={H-2}
        stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      {/* Centre circle */}
      <circle cx={W/2} cy={H/2} r="73" fill="none"
        stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <circle cx={W/2} cy={H/2} r="3.5" fill="rgba(255,255,255,0.7)" />
      {/* Left penalty area */}
      <rect x="2" y="130" width="120" height="260" fill="none"
        stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x="2" y="195" width="40" height="130" fill="none"
        stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <rect x="0" y="222" width="5" height="76" fill="rgba(255,255,255,0.75)" />
      {/* Right penalty area */}
      <rect x={W-122} y="130" width="120" height="260" fill="none"
        stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      <rect x={W-42} y="195" width="40" height="130" fill="none"
        stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <rect x={W-5} y="222" width="5" height="76" fill="rgba(255,255,255,0.75)" />
      {/* Penalty spots */}
      <circle cx="88" cy={H/2} r="3" fill="rgba(255,255,255,0.6)" />
      <circle cx={W-88} cy={H/2} r="3" fill="rgba(255,255,255,0.6)" />
      {/* Arc arcs */}
      <path d={`M 122,195 A 73,73 0 0 1 122,${H-195}`}
        fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <path d={`M ${W-122},195 A 73,73 0 0 0 ${W-122},${H-195}`}
        fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />

      {/* ── Formation labels ── */}
      {homeShape && (
        <text x={W/4} y={20} textAnchor="middle" fontSize={11}
          fill="rgba(147,197,253,0.75)" fontWeight="700" letterSpacing="1.5">
          {homeShape}
        </text>
      )}
      {awayShape && (
        <text x={3*W/4} y={20} textAnchor="middle" fontSize={11}
          fill="rgba(252,165,165,0.75)" fontWeight="700" letterSpacing="1.5">
          {awayShape}
        </text>
      )}

      {/* ── Overload zones ── */}
      {state?.overloads.map((oz, i) => {
        const band = ZONE_BANDS.find(b => b.name === oz.zone)
        if (!band || oz.overload === 0) return null
        const isPos = oz.overload > 0
        const midY = (band.yStart + band.yEnd) / 2
        return (
          <g key={i}>
            <rect x={480} y={band.yStart} width={320} height={band.yEnd - band.yStart}
              fill={isPos ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.15)'}
              stroke={isPos ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.3)'}
              strokeWidth="1" />
            <text x={786} y={midY} textAnchor="end" dominantBaseline="middle"
              fontSize={15} fontWeight="800"
              fill={isPos ? '#4ade80' : '#f87171'}
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>
              {isPos ? `+${oz.overload}` : oz.overload}
            </text>
          </g>
        )
      })}

      {/* ── Formation lines — smooth bezier curves ── */}
      {homeLines.map(({ ln, pts }) => {
        const colors: Record<string, string> = {
          DEF: 'rgba(96,165,250,0.55)',
          MID: 'rgba(167,139,250,0.5)',
          FWD: 'rgba(251,146,60,0.5)',
        }
        return (
          <path key={`hl-${ln}`}
            d={smoothCurve(pts)}
            fill="none"
            stroke={colors[ln]}
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#line-glow)"
          />
        )
      })}
      {awayLines.map(({ ln, pts }) => {
        const colors: Record<string, string> = {
          DEF: 'rgba(252,165,165,0.55)',
          MID: 'rgba(216,180,254,0.5)',
          FWD: 'rgba(253,186,116,0.5)',
        }
        return (
          <path key={`al-${ln}`}
            d={smoothCurve(pts)}
            fill="none"
            stroke={colors[ln]}
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#line-glow)"
          />
        )
      })}

      {/* ── Shot event markers ── */}
      {state?.minute_events?.filter(e => e.type === 'shot').map((ev, i) => {
        const cx = toX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        const isGoal = ev.outcome === 'goal'
        const color = ev.team_id === homeTeamId ? '#60a5fa' : '#f87171'
        return (
          <g key={`s${i}-${state.minute}`}>
            <circle className="shot-ring" cx={cx} cy={cy} r={8}
              fill="none"
              stroke={isGoal ? '#fbbf24' : color}
              strokeWidth={isGoal ? 2.5 : 1.5} />
            {isGoal && (
              <>
                <circle cx={cx} cy={cy} r={10}
                  fill="rgba(251,191,36,0.2)" stroke="#fbbf24" strokeWidth="1.5" />
                <rect x={cx-20} y={cy-26} width={40} height={14} rx={3}
                  fill="#fbbf24" />
                <text x={cx} y={cy-19} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8.5} fill="#000" fontWeight="800">GOAL</text>
              </>
            )}
          </g>
        )
      })}

      {/* ── Counter markers ── */}
      {state?.minute_events?.filter(e => e.is_counter).map((ev, i) => {
        const cx = toX(ev.team_id === homeTeamId ? ev.x : 100 - ev.x)
        const cy = toY(ev.team_id === homeTeamId ? ev.y : 100 - ev.y)
        return (
          <g key={`c${i}-${state.minute}`}>
            <rect x={cx-28} y={cy-20} width={56} height={14} rx={3}
              fill="rgba(249,115,22,0.9)" />
            <text x={cx} y={cy-13} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill="white" fontWeight="700" letterSpacing="0.5">COUNTER</text>
          </g>
        )
      })}

      {/* ── Players ── */}
      {state?.players.map(p => {
        const cx = toX(p.x)
        const cy = toY(p.y)
        const isHome = p.team_id === homeTeamId
        const isPoss = p.team_id === possTeam
        const r = p.is_gk ? 13 : 10
        const gradId = p.is_gk
          ? (isHome ? 'grad-gk-home' : 'grad-gk-away')
          : (isHome ? 'grad-home' : 'grad-away')
        const slot = p.player_id.match(/(\d+)$/)
        const label = slot ? String(parseInt(slot[1], 10)) : '?'
        const isHov = hovered === p.player_id

        return (
          <g key={p.player_id}
            style={{ transform: `translate(${cx}px,${cy}px)`, transition: 'transform 0.65s ease-in-out' }}
            onMouseEnter={() => setHovered(p.player_id)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Possession breathing ring */}
            {isPoss && !p.is_gk && (
              <circle className="poss-ring" r={r + 5} fill="none"
                stroke={isHome ? 'rgba(147,197,253,0.7)' : 'rgba(252,165,165,0.7)'}
                strokeWidth="1.5" />
            )}

            {/* Drop shadow + filled circle */}
            <circle r={r} fill={`url(#${gradId})`}
              stroke={isHov ? '#fbbf24' : 'rgba(255,255,255,0.7)'}
              strokeWidth={isHov ? 2 : 1.2}
              filter="url(#player-shadow)" />

            {/* Shirt number */}
            <text textAnchor="middle" dominantBaseline="middle" y={0.5}
              fontSize={p.is_gk ? 8.5 : 7.5} fill="white" fontWeight="700"
              style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
              {label}
            </text>

            {/* Hover tooltip */}
            {isHov && (
              <g>
                <rect x={-40} y={-r-26} width={80} height={20} rx={4}
                  fill="rgba(15,15,20,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
                <text x={0} y={-r-19} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="white" fontWeight="600"
                  style={{ pointerEvents: 'none' }}>
                  {p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name}
                </text>
                <text x={0} y={-r-9} textAnchor="middle" dominantBaseline="middle"
                  fontSize={7.5} fill={isHome ? '#93c5fd' : '#fca5a5'}
                  style={{ pointerEvents: 'none' }}>
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
          cx={toX(state.ball_x)}
          cy={toY(state.ball_y)}
          r={7}
          fill="url(#grad-ball)"
          stroke="rgba(80,80,80,0.6)"
          strokeWidth="1"
          filter="url(#ball-shadow)"
          style={{ transition: 'cx 0.65s ease-in-out, cy 0.65s ease-in-out' }}
        />
      )}

      {/* ── Possession pill ── */}
      {state && (
        <g>
          <rect x={W/2-50} y={4} width={100} height={16} rx={8}
            fill={isPossHome ? 'rgba(30,64,175,0.85)' : 'rgba(153,27,27,0.85)'}
            stroke={isPossHome ? 'rgba(96,165,250,0.4)' : 'rgba(248,113,113,0.4)'}
            strokeWidth="0.75" />
          <text x={W/2} y={12} textAnchor="middle" dominantBaseline="middle"
            fontSize={9.5} fill="rgba(255,255,255,0.95)" fontWeight="600" letterSpacing="0.3">
            {isPossHome ? '▶' : '◀'} {(isPossHome ? (homeName ?? 'HOME') : (awayName ?? 'AWAY')).toUpperCase()}
          </text>
        </g>
      )}

      {/* ── Rest defence warning ── */}
      {(() => {
        const rest = state?.overloads.reduce((a, o) => Math.max(a, o.rest_defence ?? 0), 0) ?? 0
        if (!state || rest > 4) return null
        return (
          <g>
            <rect x={8} y={H/2-10} width={82} height={20} rx={4}
              fill={rest <= 2 ? 'rgba(220,38,38,0.7)' : 'rgba(245,158,11,0.6)'}
              stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
            <text x={49} y={H/2} textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fill="white" fontWeight="600">
              {rest <= 2 ? '⚠ ' : ''}Rest def: {rest}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
