import { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../api'
import { MatchState } from '../types'

interface UseReplayResult {
  minute: number
  playing: boolean
  speed: 1 | 2 | 4
  play: () => void
  pause: () => void
  seek: (m: number) => void
  setSpeed: (s: 1 | 2 | 4) => void
  state: MatchState | null
  loading: boolean
}

export function useReplay(matchId: string | null): UseReplayResult {
  const [minute, setMinute] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState<1 | 2 | 4>(1)
  const [state, setState] = useState<MatchState | null>(null)
  const [loading, setLoading] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Playback interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (playing) {
      intervalRef.current = setInterval(() => {
        setMinute(prev => {
          if (prev >= 90) {
            setPlaying(false)
            return 90
          }
          return prev + 1
        })
      }, 1000 / speed)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed])

  // Debounced state fetch
  useEffect(() => {
    if (!matchId) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      API.getMatchState(matchId, minute)
        .then(data => setState(data))
        .catch(() => setState(null))
        .finally(() => setLoading(false))
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [matchId, minute])

  // Reset on match change
  useEffect(() => {
    setMinute(1)
    setPlaying(false)
    setState(null)
  }, [matchId])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const seek = useCallback((m: number) => setMinute(Math.max(1, Math.min(90, m))), [])
  const setSpeed = useCallback((s: 1 | 2 | 4) => setSpeedState(s), [])

  return { minute, playing, speed, play, pause, seek, setSpeed, state, loading }
}
