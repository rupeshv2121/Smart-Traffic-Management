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
