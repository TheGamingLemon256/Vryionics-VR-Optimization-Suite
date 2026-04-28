// VR Optimization Suite — Status Dot
// Severity-colored indicator dot with optional pulse animation.

import React from 'react'

export type DotStatus = 'healthy' | 'warning' | 'critical' | 'scanning' | 'unknown' | 'error'

interface StatusDotProps {
  status: DotStatus
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
  className?: string
}

const STATUS_CLASSES: Record<DotStatus, string> = {
  healthy:  'bg-vr-healthy shadow-vr-healthy/40',
  warning:  'bg-vr-warning shadow-vr-warning/40',
  critical: 'bg-vr-critical shadow-vr-critical/40',
  scanning: 'bg-vr-scanning shadow-vr-scanning/40',
  error:    'bg-vr-critical shadow-vr-critical/40',
  unknown:  'bg-gray-500'
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3'
}

const AUTO_PULSE: DotStatus[] = ['scanning', 'critical']

export function StatusDot({ status, size = 'md', pulse, className = '' }: StatusDotProps): React.ReactElement {
  const shouldPulse = pulse ?? AUTO_PULSE.includes(status)
  return (
    <span
      className={`
        inline-block rounded-full flex-shrink-0 shadow-lg
        ${STATUS_CLASSES[status]}
        ${SIZE_CLASSES[size]}
        ${shouldPulse ? 'animate-pulse' : ''}
        ${className}
      `}
      aria-label={status}
    />
  )
}
