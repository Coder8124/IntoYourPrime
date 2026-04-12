/**
 * Decorative MediaPipe-style pose skeleton for the home page hero.
 * Static SVG of a person in a squat, styled to match the app's blue/purple palette.
 */
export function PoseSkeletonDecor() {
  // Landmark positions (viewBox 160 × 290) — squat pose
  const pts = {
    nose:   [80, 14],
    lSh:    [52, 72],  rSh:   [108, 72],
    lEl:    [30, 118], rEl:   [130, 118],
    lWr:    [20, 152], rWr:   [140, 152],
    lHip:   [62, 158], rHip:  [98, 158],
    lKn:    [44, 212], rKn:   [116, 212],
    lAn:    [36, 268], rAn:   [124, 268],
  } as const

  const connections: Array<[keyof typeof pts, keyof typeof pts, string]> = [
    // torso
    ['lSh',  'rSh',  '#3b82f6'],
    ['lSh',  'lHip', '#3b82f6'],
    ['rSh',  'rHip', '#3b82f6'],
    ['lHip', 'rHip', '#3b82f6'],
    // neck/head
    ['nose', 'lSh',  '#6366f1'],
    ['nose', 'rSh',  '#6366f1'],
    // left arm
    ['lSh', 'lEl',   '#8b5cf6'],
    ['lEl', 'lWr',   '#a78bfa'],
    // right arm
    ['rSh', 'rEl',   '#8b5cf6'],
    ['rEl', 'rWr',   '#a78bfa'],
    // left leg
    ['lHip', 'lKn',  '#2563eb'],
    ['lKn',  'lAn',  '#3b82f6'],
    // right leg
    ['rHip', 'rKn',  '#2563eb'],
    ['rKn',  'rAn',  '#3b82f6'],
  ]

  const landmarks = Object.values(pts)

  return (
    <svg
      viewBox="0 0 160 290"
      width="140"
      height="253"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 0 18px rgba(99,102,241,0.45))' }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#a78bfa" stopOpacity="1" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>

        <style>{`
          @keyframes skeletonPulse {
            0%, 100% { opacity: 0.75; }
            50%       { opacity: 1; }
          }
          .sk-body { animation: skeletonPulse 3s ease-in-out infinite; }
          @keyframes skeletonFloat {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-5px); }
          }
          .sk-wrap { animation: skeletonFloat 4s ease-in-out infinite; }
        `}</style>
      </defs>

      <g className="sk-wrap">
        <g className="sk-body">
          {/* Skeleton lines */}
          {connections.map(([a, b, color], i) => (
            <line
              key={i}
              x1={pts[a][0]} y1={pts[a][1]}
              x2={pts[b][0]} y2={pts[b][1]}
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.85"
            />
          ))}

          {/* Landmark dots */}
          {landmarks.map(([x, y], i) => (
            <g key={i}>
              {/* glow halo */}
              <circle cx={x} cy={y} r="7" fill="url(#dotGlow)" opacity="0.4" />
              {/* solid dot */}
              <circle cx={x} cy={y} r="3.5" fill="#c4b5fd" opacity="0.95" />
            </g>
          ))}

          {/* Head circle */}
          <circle
            cx={pts.nose[0]} cy={pts.nose[1] - 12}
            r="11"
            stroke="#6366f1"
            strokeWidth="2"
            fill="rgba(99,102,241,0.08)"
          />
        </g>
      </g>
    </svg>
  )
}
