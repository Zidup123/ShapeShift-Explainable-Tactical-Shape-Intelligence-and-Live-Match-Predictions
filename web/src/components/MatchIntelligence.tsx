import { useMemo } from 'react'
import { MatchState, LiveStatPoint, PredictionPoint } from '../types'

interface Props {
  minute: number
  state: MatchState | null
  stats: LiveStatPoint | null
  prediction: PredictionPoint | null
  recentStats: LiveStatPoint[]  // last 10 minutes of liveStats for momentum
  homeName: string
  awayName: string
}

function counterLabel(risk: number): { word: string; color: string } {
  if (risk > 0.6) return { word: 'HIGH', color: '#ef4444' }
  if (risk > 0.35) return { word: 'MODERATE', color: '#f97316' }
  return { word: 'LOW', color: '#22c55e' }
}

function buildStory(
  minute: number,
  state: MatchState,
  stats: LiveStatPoint | null,
  pred: PredictionPoint | null,
  recentStats: LiveStatPoint[],
  home: string,
  away: string,
): { headline: string; body: string; drivers: string[]; nextMinutes: string[] } {
  const scoreDiff = state.home_goals - state.away_goals
  const phase =
    minute < 15 ? 'early on'
    : minute < 30 ? 'in the opening half'
    : minute < 45 ? 'as the first half winds down'
    : minute < 55 ? 'in the early second half'
    : minute < 70 ? 'in the second half'
    : minute < 80 ? 'in the closing stages'
    : 'in the final minutes'

  const scoreCtx =
    scoreDiff === 0 ? `level at ${state.home_goals}–${state.home_goals}`
    : scoreDiff > 0 ? `${home} lead ${state.home_goals}–${state.away_goals}`
    : `${away} lead ${state.away_goals}–${state.home_goals}`

  const xgHome = stats?.xg_home ?? 0
  const xgAway = stats?.xg_away ?? 0
  const xgDiff = xgHome - xgAway
  const xgLeader = Math.abs(xgDiff) > 0.12 ? (xgDiff > 0 ? home : away) : null
  const xgTrailer = xgLeader === home ? away : home

  const possPct = stats ? Math.round(stats.poss_pct_home * 100) : 50
  const possTeam = possPct > 53 ? home : possPct < 47 ? away : null
  const possVal = possPct >= 50 ? possPct : 100 - possPct

  // Best overload zone
  const maxOv = state.overloads.reduce<typeof state.overloads[0] | null>(
    (best, oz) => !best || Math.abs(oz.overload) > Math.abs(best.overload) ? oz : best,
    null
  )
  const ovTeam = maxOv && maxOv.overload > 0 ? home : maxOv && maxOv.overload < 0 ? away : null
  const zoneName = maxOv?.zone.replace('_', ' ') ?? ''

  // Momentum from recent stats (last 10 min xG delta)
  const recentXgHome = recentStats.length >= 2
    ? (recentStats[recentStats.length - 1].xg_home - recentStats[0].xg_home)
    : 0
  const recentXgAway = recentStats.length >= 2
    ? (recentStats[recentStats.length - 1].xg_away - recentStats[0].xg_away)
    : 0
  const momentumTeam = recentXgHome > recentXgAway + 0.05 ? home
    : recentXgAway > recentXgHome + 0.05 ? away : null

  // Score pressure
  const urgent = Math.abs(scoreDiff) === 1 && minute >= 70
  const trailingTeam = scoreDiff > 0 ? away : scoreDiff < 0 ? home : null

  // --- Compose narrative body ---
  const sentences: string[] = []

  sentences.push(`${phase.charAt(0).toUpperCase() + phase.slice(1)}, the match is ${scoreCtx}.`)

  if (xgLeader) {
    const xgL = xgLeader === home ? xgHome : xgAway
    const xgTr = xgLeader === home ? xgAway : xgHome
    sentences.push(
      `Despite that, ${xgLeader} are creating higher-quality chances — ${xgL.toFixed(2)} xG to ${xgTrailer}'s ${xgTr.toFixed(2)}.`
    )
  }

  if (possTeam) {
    const dominated = possVal >= 60 ? 'dominating' : 'edging'
    sentences.push(`${possTeam} are ${dominated} possession at ${possVal}%.`)
  }

  if (ovTeam && maxOv && maxOv.overload !== 0) {
    sentences.push(
      `${ovTeam} are exploiting the ${zoneName} with a ${Math.abs(maxOv.overload)}-player overload.`
    )
  }

  if (momentumTeam) {
    sentences.push(`Momentum has shifted to ${momentumTeam} over the last 10 minutes.`)
  }

  if (urgent && trailingTeam) {
    sentences.push(`With only ${90 - minute} minutes remaining, ${trailingTeam} are running out of time.`)
  }

  const body = sentences.join(' ')

  // --- Headline ---
  const favTeam = pred
    ? (pred.p_next_goal_home >= pred.p_next_goal_away ? home : away)
    : null
  const favPct = pred
    ? Math.round(Math.max(pred.p_next_goal_home, pred.p_next_goal_away) / (pred.p_next_goal_home + pred.p_next_goal_away) * 100)
    : null
  const { word: cWord } = pred ? counterLabel(pred.counter_risk) : { word: '' }

  const headline = favTeam && favPct
    ? `${favTeam} favoured for next goal (${favPct}%) · Counter risk ${cWord}`
    : 'Monitoring for next decisive moment'

  // --- Next 15 min bullet points ---
  const nextMinutes: string[] = []
  if (pred) {
    const xgH = pred.xg_next_15_home.toFixed(2)
    const xgA = pred.xg_next_15_away.toFixed(2)
    nextMinutes.push(`Expected xG: ${home} ${xgH} · ${away} ${xgA}`)
    if (pred.counter_risk > 0.55) {
      const restDef = maxOv?.rest_defence ?? '?'
      nextMinutes.push(`Only ${restDef} defenders in rest defence — counter vulnerability is real`)
    }
    if (pred.p_next_goal_home > 0.55 || pred.p_next_goal_away > 0.55) {
      nextMinutes.push(`${favTeam} has ${favPct}% chance of scoring next based on current shape and pressure`)
    }
    if (scoreDiff === 0 && minute > 75) {
      nextMinutes.push('Level game in extra time — both teams exposed to the sucker punch')
    }
  }
  if (nextMinutes.length === 0) {
    nextMinutes.push('Game state is balanced — watch for a set piece to break the deadlock')
  }

  // --- Key drivers ---
  const drivers: string[] = []
  if (maxOv && maxOv.overload !== 0) {
    drivers.push(`Zone overload: ${zoneName} (${maxOv.overload > 0 ? '+' : ''}${maxOv.overload})`)
  }
  if (maxOv?.rest_defence !== undefined) {
    drivers.push(`Rest defence: ${maxOv.rest_defence} players`)
  }
  const homeShapeFit = Math.round((state.shapes.home.fit_score ?? 0) * 100)
  const awayShapeFit = Math.round((state.shapes.away.fit_score ?? 0) * 100)
  drivers.push(`${home} shape fit ${homeShapeFit}% · ${away} ${awayShapeFit}%`)

  return { headline, body, drivers, nextMinutes }
}

export default function MatchIntelligence({ minute, state, stats, prediction, recentStats, homeName, awayName }: Props) {
  const story = useMemo(() => {
    if (!state) return null
    return buildStory(minute, state, stats, prediction, recentStats, homeName, awayName)
  }, [minute, state, stats, prediction, recentStats, homeName, awayName])

  const counterInfo = prediction ? counterLabel(prediction.counter_risk) : null

  if (!state) {
    return (
      <div className="rounded-lg p-4 border border-gray-800 text-gray-600 text-sm text-center" style={{ background: '#0d1117' }}>
        Select a match to see analysis
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Headline bar */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between gap-3" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 leading-tight">
            {story?.headline ?? '—'}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 flex-shrink-0">MIN {minute}</span>
      </div>

      <div className="p-4 grid grid-cols-3 gap-4">
        {/* Narrative body */}
        <div className="col-span-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Situation</div>
          <p className="text-xs text-gray-300 leading-relaxed">{story?.body}</p>

          {/* Key drivers */}
          {story && story.drivers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {story.drivers.map((d, i) => (
                <span key={i} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Next 15 min */}
        <div className="border-l border-gray-800 pl-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Next 15 min</div>
            {counterInfo && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: counterInfo.color + '22', color: counterInfo.color }}>
                {counterInfo.word}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {story?.nextMinutes.map((line, i) => (
              <li key={i} className="flex gap-1.5 text-[10px] text-gray-400 leading-snug">
                <span className="text-blue-500 flex-shrink-0 mt-0.5">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
