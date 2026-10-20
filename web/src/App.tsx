import React, { useState, useEffect } from 'react'
import { API } from './api'
import { Match, PredictionPoint, Fact } from './types'
import { useReplay } from './hooks/useReplay'
import PitchView from './components/PitchView'
import ReplayControls from './components/ReplayControls'
import ProbabilityTimeline from './components/ProbabilityTimeline'
import NarrativeLowerThird from './components/NarrativeLowerThird'
import EvidenceDrawer from './components/EvidenceDrawer'
import MatchSelector from './components/MatchSelector'

export default function App() {
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<PredictionPoint[]>([])
  const [facts, setFacts] = useState<Record<string, Fact>>({})
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(true)

  const { minute, playing, speed, play, pause, seek, setSpeed, state, loading } =
    useReplay(selectedMatchId)

  const selectedMatch = matches.find(m => m.match_id === selectedMatchId) ?? null

  // Load matches on mount
  useEffect(() => {
    API.getMatches()
      .then((data: Match[]) => setMatches(data))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false))
  }, [])

  // Load facts on mount
  useEffect(() => {
    API.getFacts()
      .then((data: Record<string, Fact>) => setFacts(data))
      .catch(() => setFacts({}))
  }, [])

  // Load predictions when match selected
  useEffect(() => {
    if (!selectedMatchId) {
      setPredictions([])
      return
    }
    API.getPredictions(selectedMatchId)
      .then((data: PredictionPoint[]) => setPredictions(data))
      .catch(() => setPredictions([]))
  }, [selectedMatchId])

  const homeId = selectedMatch?.home_id ?? ''
  const awayId = selectedMatch?.away_id ?? ''

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
        <h1 className="text-xl font-bold tracking-wide text-white">ShapeShift</h1>
        <span className="text-xs bg-yellow-700 text-yellow-100 px-2 py-1 rounded font-semibold">
          SYNTHETIC DATA
        </span>
      </header>

      <div className="flex gap-4 p-4 max-w-screen-xl mx-auto">
        {/* Left column: selector + pitch + controls */}
        <div className="flex-1 min-w-0">
          <div className="mb-3">
            {matchesLoading ? (
              <p className="text-gray-400 text-sm">Loading matches…</p>
            ) : (
              <MatchSelector
                matches={matches}
                selected={selectedMatchId}
                onChange={id => setSelectedMatchId(id)}
              />
            )}
          </div>

          {/* Pitch */}
          <div className="relative rounded-lg overflow-hidden border border-gray-700">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                <span className="text-white text-sm">Loading…</span>
              </div>
            )}
            <PitchView state={state} homeTeamId={homeId} />
          </div>

          {/* Narrative */}
          {selectedMatchId && (
            <NarrativeLowerThird
              matchId={selectedMatchId}
              minute={minute}
              homeTeamId={homeId}
              awayTeamId={awayId}
            />
          )}

          {/* Replay controls */}
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

        {/* Right column: timeline + evidence */}
        <div className="w-72 flex flex-col gap-4 flex-shrink-0">
          <ProbabilityTimeline
            predictions={predictions}
            currentMinute={minute}
          />

          {/* Shape info */}
          {state && (
            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-sm">
              <div className="text-gray-400 text-xs mb-2 uppercase tracking-wider">Shapes</div>
              <div className="flex justify-between mb-1">
                <span className="text-blue-400 font-medium">{homeId}</span>
                <span className="text-gray-300">{state.shapes.home.in_possession}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-400 font-medium">{awayId}</span>
                <span className="text-gray-300">{state.shapes.away.in_possession}</span>
              </div>
            </div>
          )}

          {/* Evidence button */}
          <button
            onClick={() => setEvidenceOpen(true)}
            className="w-full py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 text-sm font-medium"
          >
            Evidence ({Object.keys(facts).length} facts)
          </button>
        </div>
      </div>

      {/* Evidence drawer overlay */}
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
