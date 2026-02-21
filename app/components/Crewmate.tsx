interface CrewmateProps {
  color: string
  size?: number
  dead?: boolean
  className?: string
}

/**
 * A simple Among Us crewmate silhouette using SVG.
 * Body + visor + backpack — all filled with the player colour.
 */
export default function Crewmate({ color, size = 48, dead = false, className = '' }: CrewmateProps) {
  const fill = dead ? '#44445a' : color
  const visor = dead ? '#22223a' : '#0af'
  const opacity = dead ? 0.5 : 1

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      className={className}
      style={{ opacity }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Body */}
      <ellipse cx="50" cy="75" rx="35" ry="40" fill={fill} />
      {/* Head */}
      <ellipse cx="50" cy="38" rx="28" ry="30" fill={fill} />
      {/* Visor */}
      <ellipse cx="55" cy="34" rx="18" ry="14" fill={visor} opacity="0.9" />
      {/* Backpack */}
      <rect x="78" y="58" width="16" height="30" rx="7" fill={fill} />
      {/* Legs */}
      <ellipse cx="38" cy="112" rx="12" ry="8" fill={fill} />
      <ellipse cx="62" cy="112" rx="12" ry="8" fill={fill} />
      {/* Dead X eyes overlay */}
      {dead && (
        <g stroke="#ff3366" strokeWidth="5" strokeLinecap="round">
          <line x1="44" y1="28" x2="52" y2="36" />
          <line x1="52" y1="28" x2="44" y2="36" />
          <line x1="56" y1="28" x2="64" y2="36" />
          <line x1="64" y1="28" x2="56" y2="36" />
        </g>
      )}
    </svg>
  )
}
