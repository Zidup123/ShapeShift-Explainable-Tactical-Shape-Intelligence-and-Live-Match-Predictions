import { Match } from '../types'

interface MatchSelectorProps {
  matches: Match[]
  selected: string | null
  onChange: (id: string) => void
}

export default function MatchSelector({
  matches,
  selected,
  onChange,
}: MatchSelectorProps) {
  return (
    <select
      value={selected ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="" disabled>
        Select a match…
      </option>
      {matches.map(m => (
        <option key={m.match_id} value={m.match_id}>
          {m.home_name} vs {m.away_name} (MD{m.matchday})
        </option>
      ))}
    </select>
  )
}
