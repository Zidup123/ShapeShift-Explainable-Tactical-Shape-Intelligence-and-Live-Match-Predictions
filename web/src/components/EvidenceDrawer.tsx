import React from 'react'
import { Fact } from '../types'

interface EvidenceDrawerProps {
  facts: Record<string, Fact>
  homeTeamId: string
  awayTeamId: string
  open: boolean
  onClose: () => void
}

const CONFIDENCE_COLOURS: Record<string, string> = {
  ok: 'bg-green-700 text-green-100',
  tentative: 'bg-yellow-700 text-yellow-100',
}

export default function EvidenceDrawer({
  facts,
  homeTeamId,
  awayTeamId,
  open,
  onClose,
}: EvidenceDrawerProps) {
  if (!open) return null

  // Filter to facts mentioning either team and with confidence "ok";
  // then append remaining, up to 5 total
  const entries = Object.entries(facts) as [string, Fact][]

  const relevant = entries
    .filter(([, f]) => {
      const claim = f.claim ?? ''
      return (
        (claim.includes(homeTeamId) || claim.includes(awayTeamId)) &&
        f.confidence === 'ok'
      )
    })
    .slice(0, 5)

  const displayed =
    relevant.length >= 5
      ? relevant
      : [
          ...relevant,
          ...entries
            .filter(([id]) => !relevant.find(([rid]) => rid === id))
            .slice(0, 5 - relevant.length),
        ]

  return (
    <div className="fixed inset-y-0 right-0 w-80 z-50 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h2 className="font-semibold text-white">Evidence</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl leading-none"
          aria-label="Close evidence drawer"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-900 p-3 space-y-3">
        {displayed.length === 0 && (
          <p className="text-gray-500 text-sm">No evidence available.</p>
        )}
        {displayed.map(([fid, fact]) => (
          <div
            key={fid}
            className="bg-gray-800 rounded-lg p-3 border border-gray-700"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs text-gray-500 font-mono">{fid}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  CONFIDENCE_COLOURS[fact.confidence] ?? 'bg-gray-700 text-gray-300'
                }`}
              >
                {fact.confidence}
              </span>
            </div>
            <p className="text-sm text-gray-200 leading-snug mb-2">{fact.claim}</p>
            <p className="text-xs text-gray-500">n = {fact.sample_size}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
