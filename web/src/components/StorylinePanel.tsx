import { useState } from 'react'
import { Fact } from '../types'

interface StorylinePanelProps {
  facts: Record<string, Fact>
  homeTeamId: string
  awayTeamId: string
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: '#22c55e',
  medium: '#f97316',
  low: '#6b7280',
  tentative: '#a855f7',
}

export default function StorylinePanel({ facts, homeTeamId, awayTeamId }: StorylinePanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  // Filter to facts that mention either team in their claim
  const relevant = Object.entries(facts)
    .filter(([, f]) => {
      if (!f || typeof f.claim !== 'string') return false
      return f.claim.includes(homeTeamId) || f.claim.includes(awayTeamId)
    })
    .slice(0, 4)

  if (relevant.length === 0) {
    return (
      <div className="rounded-lg p-3 border border-gray-700 text-xs text-gray-600 text-center" style={{ background: '#111827' }}>
        No storylines for this match
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden" style={{ background: '#111827' }}>
      <div className="px-3 py-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Storylines</span>
      </div>
      <div className="divide-y divide-gray-800">
        {relevant.map(([fid, fact]) => {
          const isOpen = expanded === fid
          const color = CONFIDENCE_COLOR[fact.confidence?.toLowerCase()] ?? '#6b7280'
          return (
            <div key={fid} className="px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors" onClick={() => setExpanded(isOpen ? null : fid)}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <p className="text-[11px] text-gray-300 leading-snug">{fact.claim}</p>
              </div>
              {isOpen && (
                <div className="mt-2 ml-4 text-[10px] text-gray-500 space-y-0.5">
                  <p>Sample: {fact.sample_size} · Confidence: <span style={{ color }}>{fact.confidence}</span></p>
                  {Object.entries(fact.numbers ?? {}).map(([k, v]) => (
                    <p key={k}>{k}: <span className="text-gray-300">{v}</span></p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
