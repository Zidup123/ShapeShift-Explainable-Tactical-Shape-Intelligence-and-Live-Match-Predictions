import React from 'react'
import { Match, MatchState } from '../types'

interface ReplayControlsProps {
  match: Match | null
  minute: number
  playing: boolean
  speed: 1 | 2 | 4
  state: MatchState | null
  onPlay: () => void
  onPause: () => void
  onSeek: (m: number) => void
  onSpeedChange: (s: 1 | 2 | 4) => void
}

export default function ReplayControls({
  match,
  minute,
  playing,
  speed,
  state,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: ReplayControlsProps) {
  const homeGoals = state?.home_goals ?? match?.home_goals ?? 0
  const awayGoals = state?.away_goals ?? match?.away_goals ?? 0
  const possessionTeam = state?.possession_team ?? ''

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mt-2">
      {/* Match title */}
      <div className="text-center text-sm text-gray-400 mb-1">
        {match
          ? `${match.home_name} vs ${match.away_name} — Matchday ${match.matchday}`
          : 'Select a match'}
      </div>

      {/* Score */}
      <div className="text-center text-3xl font-bold mb-3">
        {homeGoals} – {awayGoals}
      </div>

      {/* Minute + possession */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl font-semibold">{minute}&apos;</span>

        {possessionTeam && (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{
                background:
                  possessionTeam === match?.home_id ? '#3b82f6' : '#ef4444',
              }}
            />
            <span>{possessionTeam}</span>
          </div>
        )}
      </div>

      {/* Scrub bar */}
      <input
        type="range"
        min={1}
        max={90}
        value={minute}
        onChange={e => onSeek(Number(e.target.value))}
        className="w-full accent-blue-500 mb-3"
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Play / Pause */}
        <button
          onClick={playing ? onPause : onPlay}
          disabled={!match}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-semibold text-sm"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        {/* Speed selector */}
        <div className="flex gap-1">
          {([1, 2, 4] as (1 | 2 | 4)[]).map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                speed === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
