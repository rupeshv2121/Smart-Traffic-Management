interface PhotoBackdropProps {
  /** Image sources to crossfade through (tuned for 3). */
  images: string[];
  /** Extra class on the container — provides position, size, mask, opacity. */
  className?: string;
  /** Seconds each image holds before crossfading to the next. */
  interval?: number;
}

/**
 * Slow, looping crossfade between background photos. Pure CSS animation
 * (no timers) so it pauses for prefers-reduced-motion. Each layer is offset by
 * `interval` seconds; the shared keyframe is tuned for three images.
 */
export function PhotoBackdrop({ images, className = "", interval = 7 }: PhotoBackdropProps) {
  const total = images.length * interval;
  return (
    <div className={`photo-backdrop ${className}`.trim()} aria-hidden>
      {images.map((src, i) => (
        <div
          key={src}
          className="pb-layer"
          style={{
            backgroundImage: `url(${src})`,
            animationDuration: `${total}s`,
            animationDelay: `${i * interval}s`,
          }}
        />
      ))}
    </div>
  );
}
