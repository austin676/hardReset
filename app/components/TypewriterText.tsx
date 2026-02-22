import { useState, useEffect } from 'react'

interface TypewriterTextProps {
  text: string
  /** ms per character when typing (default 120) */
  typeSpeed?: number
  /** ms per character when deleting (default 70) */
  deleteSpeed?: number
  /** ms to wait at full word before deleting (default 1800) */
  pauseFull?: number
  /** ms to wait after full delete before retyping (default 500) */
  pauseEmpty?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Continuously types + deletes a word, then loops.
 * Shows a blinking block cursor at all times.
 */
export default function TypewriterText({
  text,
  typeSpeed   = 120,
  deleteSpeed = 65,
  pauseFull   = 1800,
  pauseEmpty  = 400,
  className,
  style,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting' | 'waiting'>('typing')

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    if (phase === 'typing') {
      if (displayed.length < text.length) {
        timeout = setTimeout(
          () => setDisplayed(text.slice(0, displayed.length + 1)),
          typeSpeed,
        )
      } else {
        timeout = setTimeout(() => setPhase('pausing'), pauseFull)
      }
    } else if (phase === 'pausing') {
      setPhase('deleting')
    } else if (phase === 'deleting') {
      if (displayed.length > 0) {
        timeout = setTimeout(
          () => setDisplayed(displayed.slice(0, -1)),
          deleteSpeed,
        )
      } else {
        timeout = setTimeout(() => setPhase('waiting'), pauseEmpty)
      }
    } else if (phase === 'waiting') {
      setPhase('typing')
    }

    return () => clearTimeout(timeout)
  }, [displayed, phase, text, typeSpeed, deleteSpeed, pauseFull, pauseEmpty])

  return (
    <span className={className} style={style}>
      {displayed}
      <span
        style={{
          display: 'inline-block',
          width: '0.55em',
          height: '1em',
          background: 'currentColor',
          marginLeft: '3px',
          verticalAlign: 'text-bottom',
          animation: 'caret-blink 1s step-end infinite',
        }}
      />
    </span>
  )
}
