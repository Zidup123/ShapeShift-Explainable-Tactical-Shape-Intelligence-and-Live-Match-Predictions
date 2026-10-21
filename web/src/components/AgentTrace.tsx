import { useState } from 'react'
import { AgentStep } from '../types'

interface AgentTraceProps {
  trace: AgentStep[]
  loading: boolean
}

const AGENT_LABEL: Record<string, string> = {
  analyst: 'Analyst',
  narrator: 'Narrator',
  verifier: 'Verifier',
}

const AGENT_DESC: Record<string, string> = {
  analyst: 'Extracts tactical observations from match state',
  narrator: 'Generates grounded commentary from analyst output',
  verifier: 'Checks every number traces back to facts.json',
}

const MODE_BADGE: Record<string, { label: string; color: string }> = {
  azure:         { label: 'Azure Foundry', color: '#0078d4' },
  stub:          { label: 'Local stub',    color: '#6b7280' },
  stub_fallback: { label: 'Fallback',      color: '#f97316' },
  local:         { label: 'Local',         color: '#6b7280' },
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'pass' ? '#22c55e' : status === 'fallback' ? '#f97316' : '#ef4444'
  return <span className="h-2 w-2 rounded-full flex-shrink-0 inline-block" style={{ background: color }} />
}

function StepCard({ step, index }: { step: AgentStep; index: number }) {
  const [open, setOpen] = useState(false)
  const badge = MODE_BADGE[step.mode] ?? { label: step.mode, color: '#6b7280' }

  return (
    <div className="flex-1 min-w-0">
      {/* Step number connector */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] text-gray-600 font-mono">{index + 1}</span>
        <div className="h-px flex-1 bg-gray-800" />
      </div>

      <div
        className="rounded-lg border border-gray-700 overflow-hidden cursor-pointer hover:border-gray-500 transition-colors"
        style={{ background: '#111827' }}
        onClick={() => setOpen(o => !o)}
      >
        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={step.status} />
            <span className="text-xs font-semibold text-gray-200">{AGENT_LABEL[step.agent] ?? step.agent}</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
              style={{ background: badge.color + '22', color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
          <span className="text-[9px] text-gray-600 flex-shrink-0">{step.elapsed_ms}ms</span>
        </div>

        {/* Summary */}
        <div className="px-3 pb-2 text-[10px] text-gray-500 leading-snug">{step.summary}</div>

        {/* Expanded output */}
        {open && (
          <div className="border-t border-gray-800 px-3 py-2">
            <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wider">
              {AGENT_DESC[step.agent]}
            </div>
            <pre className="text-[9px] text-gray-400 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
              {typeof step.output === 'string'
                ? step.output
                : JSON.stringify(step.output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AgentTrace({ trace, loading }: AgentTraceProps) {
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Agent chain</span>
          {loading && (
            <span className="text-[9px] text-blue-400 animate-pulse">running…</span>
          )}
        </div>
        <span className="text-[9px] text-gray-600">click to inspect</span>
      </div>

      {trace.length === 0 ? (
        <div className="px-3 py-4 text-[10px] text-gray-700 text-center">
          {loading ? 'Calling agents…' : 'No trace yet — select a match and scrub forward'}
        </div>
      ) : (
        <div className="p-3 flex gap-2 items-start">
          {trace.map((step, i) => (
            <StepCard key={step.agent} step={step} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
