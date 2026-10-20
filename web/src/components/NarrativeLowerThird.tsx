import { useState, useEffect, useRef } from 'react'
import { API } from '../api'

interface NarrativeLowerThirdProps {
  matchId: string
  minute: number
  homeTeamId: string
  awayTeamId: string
}

export default function NarrativeLowerThird({
  matchId,
  minute,
}: NarrativeLowerThirdProps) {
  const [text, setText] = useState('')
  const [pulse, setPulse] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!matchId) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      API.getNarrative(matchId, minute)
        .then((data: { text: string }) => {
          setText(data.text ?? '')
          // Trigger pulse animation on update
          setPulse(true)
          setTimeout(() => setPulse(false), 800)
        })
        .catch(() => {/* silently ignore */})
    }, 2000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [matchId, minute])

  if (!text) return null

  return (
    <div
      className="rounded-lg px-4 py-3 mt-2 flex items-center gap-3"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
    >
      {/* Pulsing indicator */}
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          background: '#3b82f6',
          boxShadow: pulse ? '0 0 8px 3px #3b82f6' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}
      />
      <p className="text-sm text-gray-200 leading-snug">{text}</p>
    </div>
  )
}
