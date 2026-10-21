import { useState, useEffect } from 'react'
import { API } from './api'
import { Match, PredictionPoint, Fact, LiveStatPoint, AgentStep } from './types'
import { useReplay } from './hooks/useReplay'
import PitchView from './components/PitchView'
import ReplayControls from './components/ReplayControls'
import ProbabilityTimeline from './components/ProbabilityTimeline'
import MatchIntelligence from './components/MatchIntelligence'
import NarrativeLowerThird from './components/NarrativeLowerThird'
import AgentTrace from './components/AgentTrace'
import EvidenceDrawer from './components/EvidenceDrawer'
import MatchSelector from './components/MatchSelector'
import MatchStatsBar from './components/MatchStatsBar'
import PredictionMeter from './components/PredictionMeter'
import StorylinePanel from './components/StorylinePanel'

export default function App() {
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<PredictionPoint[]>([])
  const [liveStats, setLiveStats] = useState<LiveStatPoint[]>([])
  const [facts, setFacts] = useState<Record<string, Fact>>({})
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [agentTrace, setAgentTrace] = useState<AgentStep[]>([])
  const [traceLoading, setTraceLoading] = useState(false)

  const { minute, playing, speed, play, pause, seek, setSpeed, state, loading } =
    useReplay(selectedMatchId)

  const selectedMatch = matches.find(m => m.match_id === selectedMatchId) ?? null
  const homeId = selectedMatch?.home_id ?? ''
  const awayId = selectedMatch?.away_id ?? ''
  const homeName = selectedMatch?.home_name ?? homeId
  const awayName = selectedMatch?.away_name ?? awayId

  // Current live stat at this minute
  const currentStats = liveStats.find(s => s.minute === minute) ?? liveStats[liveStats.length - 1] ?? null

  useEffect(() => {
    API.getMatches()
      .then((data: Match[]) => setMatches(data))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false))
  }, [])

  useEffect(() => {
    API.getFacts()
      .then((data: Record<string, Fact>) => setFacts(data))
      .catch(() => setFacts({}))
  }, [])

  useEffect(() => {
    if (!selectedMatchId) {
      setPredictions([])
      setLiveStats([])
      return
    }
    API.getPredictions(selectedMatchId)
      .then((data: PredictionPoint[]) => setPredictions(data))
      .catch(() => setPredictions([]))

    API.getLiveStats(selectedMatchId)
      .then((data: LiveStatPoint[]) => setLiveStats(data))
      .catch(() => setLiveStats([]))
  }, [selectedMatchId])

  // Prediction at current minute
  const currentPrediction = predictions.find(p => p.minute === minute) ?? predictions[predictions.length - 1] ?? null

  // Recent stats window (last 10 minutes) for momentum calculation
  const recentStats = liveStats.filter(s => s.minute >= Math.max(1, minute - 10) && s.minute <= minute)

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-wide text-white">ShapeShift</h1>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider hidden sm:block">
            Tactical Intelligence
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedMatch && (
            <span className="text-sm font-semibold text-gray-200">
              <span className="text-blue-400">{homeName}</span>
              <span className="text-gray-400 mx-2">
                {selectedMatch.home_goals} – {selectedMatch.away_goals}
              </span>
              <span className="text-red-400">{awayName}</span>
            </span>
          )}
          <span className="text-[10px] bg-yellow-700 text-yellow-100 px-2 py-0.5 rounded font-semibold">
            SYNTHETIC
          </span>
        </div>
      </header>

      {/* Match selector bar */}
      <div className="px-4 py-2 border-b border-gray-900">
        {matchesLoading ? (
          <p className="text-gray-500 text-xs">Loading matches…</p>
        ) : (
          <MatchSelector
            matches={matches}
            selected={selectedMatchId}
            onChange={id => setSelectedMatchId(id)}
          />
        )}
      </div>

      {/* Main grid */}
      <div className="flex gap-3 p-3 max-w-screen-2xl mx-auto">

        {/* Left sidebar: prediction + stats */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-3">
          <PredictionMeter
            prediction={currentPrediction}
            homeName={homeName}
            awayName={awayName}
          />
          <MatchStatsBar
            stats={currentStats}
            homeName={homeName}
            awayName={awayName}
          />
          {/* Shapes */}
          {state && (
            <div className="rounded-lg p-3 border border-gray-700 text-xs" style={{ background: '#111827' }}>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Shapes</div>
              <div className="space-y-2">
                <div>
                  <div className="text-blue-400 font-semibold mb-0.5 truncate">{homeName}</div>
                  <div className="flex justify-between text-gray-300">
                    <span className="text-gray-500 text-[10px]">in poss</span>
                    <span>{state.shapes.home.in_possession}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span className="text-gray-500 text-[10px]">out poss</span>
                    <span>{state.shapes.home.out_of_possession}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${state.shapes.home.fit_score * 100}%` }} />
                  </div>
                  <div className="text-[9px] text-gray-600 text-right">fit {(state.shapes.home.fit_score * 100).toFixed(0)}%</div>
                </div>
                <div className="border-t border-gray-800 pt-2">
                  <div className="text-red-400 font-semibold mb-0.5 truncate">{awayName}</div>
                  <div className="flex justify-between text-gray-300">
                    <span className="text-gray-500 text-[10px]">in poss</span>
                    <span>{state.shapes.away.in_possession}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span className="text-gray-500 text-[10px]">out poss</span>
                    <span>{state.shapes.away.out_of_possession}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full bg-red-700 transition-all duration-500" style={{ width: `${state.shapes.away.fit_score * 100}%` }} />
                  </div>
                  <div className="text-[9px] text-gray-600 text-right">fit {(state.shapes.away.fit_score * 100).toFixed(0)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Centre: pitch + narrative + controls */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="relative rounded-lg overflow-hidden border border-gray-700">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                <span className="text-white text-sm">Loading…</span>
              </div>
            )}
            <PitchView state={state} homeTeamId={homeId} homeName={homeName} awayName={awayName} />
          </div>

          <MatchIntelligence
            minute={minute}
            state={state}
            stats={currentStats}
            prediction={currentPrediction}
            recentStats={recentStats}
            homeName={homeName}
            awayName={awayName}
          />

          {selectedMatchId && (
            <NarrativeLowerThird
              matchId={selectedMatchId}
              minute={minute}
              homeTeamId={homeId}
              awayTeamId={awayId}
              onTrace={trace => { setAgentTrace(trace); setTraceLoading(false) }}
            />
          )}

          <ReplayControls
            match={selectedMatch}
            minute={minute}
            playing={playing}
            speed={speed}
            state={state}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
            onSpeedChange={setSpeed}
          />
        </div>

        {/* Right sidebar: timeline + storylines + evidence */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">
          <ProbabilityTimeline
            predictions={predictions}
            currentMinute={minute}
            homeName={homeName}
            awayName={awayName}
          />

          <AgentTrace trace={agentTrace} loading={traceLoading} />

          <StorylinePanel
            facts={facts}
            homeTeamId={homeId}
            awayTeamId={awayId}
          />

          <button
            onClick={() => setEvidenceOpen(true)}
            className="w-full py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 text-xs font-medium transition-colors"
          >
            Evidence vault ({Object.keys(facts).length} facts)
          </button>
        </div>
      </div>

      <EvidenceDrawer
        facts={facts}
        homeTeamId={homeId}
        awayTeamId={awayId}
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
      />
    </div>
  )
}
