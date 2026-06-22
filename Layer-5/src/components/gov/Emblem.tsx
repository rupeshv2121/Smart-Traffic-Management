// Ashoka Chakra — the 24-spoke navy wheel from the national flag. Used as the
// government identity mark across the app (the full State Emblem is regulated;
// the Chakra is the appropriate, recognisable motif for a civic dashboard).
export function AshokaChakra({ size = 44 }: { size?: number }) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Ashoka Chakra"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="#06038d" strokeWidth="4" />
      <circle cx="50" cy="50" r="7" fill="#06038d" />
      {spokes.map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="50"
          x2="50"
          y2="6"
          stroke="#06038d"
          strokeWidth="1.6"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
    </svg>
  );
}

// Large hero crest: a layered medallion with a saffron/green outer ring, a
// navy inner ring and the Ashoka Chakra at its centre. A crisp, scalable
// stand-in for a national emblem that avoids the legally-restricted State Emblem.
export function EmblemCrest({ size = 108 }: { size?: number }) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="National emblem crest with Ashoka Chakra"
    >
      <defs>
        <radialGradient id="crest-bg" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef2fb" />
        </radialGradient>
      </defs>

      {/* Tricolour outer ring: saffron over the top, green under the bottom */}
      <path
        d="M6 60 A54 54 0 0 1 114 60"
        fill="none"
        stroke="#ff9933"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M114 60 A54 54 0 0 1 6 60"
        fill="none"
        stroke="#138808"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Medallion + navy inner ring */}
      <circle cx="60" cy="60" r="50" fill="url(#crest-bg)" stroke="#cfd6e0" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#06038d" strokeWidth="2.4" />

      {/* Ashoka Chakra */}
      <circle cx="60" cy="60" r="30" fill="none" stroke="#06038d" strokeWidth="2.2" />
      <circle cx="60" cy="60" r="5" fill="#06038d" />
      {spokes.map((deg) => (
        <line
          key={deg}
          x1="60"
          y1="60"
          x2="60"
          y2="31"
          stroke="#06038d"
          strokeWidth="1.4"
          transform={`rotate(${deg} 60 60)`}
        />
      ))}
    </svg>
  );
}

// Government identity lockup: chakra inside a tricolour-ringed badge.
export function GovBadge({ size = 56 }: { size?: number }) {
  return (
    <div
      className="gov-emblem"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "#fff",
        border: "2px solid #e3e8ef",
        boxShadow: "0 1px 2px rgba(16,35,60,.08)",
      }}
    >
      <AshokaChakra size={Math.round(size * 0.72)} />
    </div>
  );
}
