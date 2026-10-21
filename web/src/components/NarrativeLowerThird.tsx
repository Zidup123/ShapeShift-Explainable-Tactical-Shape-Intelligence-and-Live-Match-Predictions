import { useState, useEffect, useRef } from 'react'
import { API } from '../api'
import { AgentStep } from '../types'

interface NarrativeLowerThirdProps {
  matchId: string
  minute: number
  homeTeamId: string
  awayTeamId: string
  onTrace?: (trace: AgentStep[]) => void
}

export default function NarrativeLowerThird({
  matchId,
  minute,
  onTrace,
}: NarrativeLowerThirdProps) {
  const [text, setText] = useState('')
  const [pulse, setPulse] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!matchId) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      API.getNarrative(matchId, minute)
        .then(data => {
          setText(data.text ?? '')
          onTrace?.(data.trace ?? [])
          setPulse(true)
          setTimeout(() => setPulse(false), 800)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 1500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [matchId, minute])

  if (!text && !loading) return null

  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-3"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          background: loading ? '#6b7280' : '#3b82f6',
          boxShadow: pulse ? '0 0 8px 3px #3b82f6' : 'none',
          transition: 'box-shadow 0.3s ease',
          animation: loading ? 'pulse 1.5s infinite' : 'none',
        }}
      />
      <p className="text-sm text-gray-200 leading-snug">
        {loading && !text ? 'Agent chain running…' : text}
      </p>
    </div>
  )
}
