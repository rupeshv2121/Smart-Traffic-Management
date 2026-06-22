// A silhouette of Delhi's landmarks — Qutub Minar, India Gate, Lotus Temple,
// Rashtrapati Bhavan dome, and the Red Fort wall — used as a subtle backdrop
// behind the hero. Pure SVG so it ships with the bundle (no image assets) and
// recolours via `currentColor`.
export function DelhiSkyline({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Skyline of Delhi landmarks"
      fill="currentColor"
    >
      {/* Qutub Minar — tall tapering tower with balconies */}
      <g>
        <path d="M70 220 L78 70 L92 70 L100 220 Z" />
        <rect x="76" y="64" width="18" height="8" />
        <rect x="74" y="110" width="22" height="5" />
        <rect x="73" y="150" width="24" height="5" />
        <rect x="72" y="188" width="26" height="5" />
        <path d="M81 70 L85 54 L89 70 Z" />
      </g>

      {/* India Gate — the memorial arch */}
      <g>
        <path d="M180 220 L180 120 Q180 96 210 96 Q240 96 240 120 L240 220 Z" />
        <rect x="170" y="86" width="80" height="12" />
        <rect x="200" y="70" width="20" height="16" />
      </g>

      {/* Rashtrapati Bhavan — central dome on a colonnade */}
      <g>
        <rect x="320" y="150" width="170" height="70" />
        <path d="M375 150 Q375 104 405 104 Q435 104 435 150 Z" />
        <rect x="398" y="80" width="14" height="26" />
        <path d="M405 70 L401 80 L409 80 Z" />
        <circle cx="405" cy="98" r="6" />
      </g>

      {/* Lotus Temple — overlapping petals */}
      <g transform="translate(560 0)">
        <path d="M0 220 L40 130 L80 220 Z" />
        <path d="M30 220 L70 110 L110 220 Z" />
        <path d="M60 220 L100 96 L140 220 Z" />
        <path d="M90 220 L130 110 L170 220 Z" />
        <path d="M120 220 L160 130 L200 220 Z" />
        <ellipse cx="100" cy="214" rx="105" ry="14" />
      </g>

      {/* Humayun's Tomb — bulb dome on a plinth */}
      <g transform="translate(800 0)">
        <rect x="0" y="160" width="150" height="60" />
        <path d="M45 160 Q45 100 75 100 Q105 100 105 160 Z" />
        <path d="M75 100 Q72 86 75 78 Q78 86 75 100 Z" />
        <rect x="10" y="150" width="14" height="70" />
        <rect x="126" y="150" width="14" height="70" />
      </g>

      {/* Red Fort — crenellated rampart with chhatris */}
      <g transform="translate(990 0)">
        <rect x="0" y="170" width="210" height="50" />
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={4 + i * 15} y="162" width="9" height="10" />
        ))}
        <rect x="40" y="130" width="34" height="40" />
        <path d="M40 130 L57 116 L74 130 Z" />
        <rect x="140" y="130" width="34" height="40" />
        <path d="M140 130 L157 116 L174 130 Z" />
        <rect x="96" y="120" width="20" height="50" />
        <path d="M93 120 Q106 100 119 120 Z" />
      </g>
    </svg>
  );
}
