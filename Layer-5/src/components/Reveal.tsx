import { type ElementType, type ReactNode } from "react";

import { useReveal } from "../hooks/useReveal";

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms, applied as a transition-delay once visible. */
  delay?: number;
  /** Animation variant — controls the entrance transform. */
  variant?: "up" | "scale" | "left" | "right";
  className?: string;
  /** Rendered element/tag. Defaults to a div. */
  as?: ElementType;
}

/**
 * Wraps content in a scroll-revealed container. Starts hidden/offset and eases
 * into place the first time it enters the viewport. Respects
 * prefers-reduced-motion via the .reveal CSS (motion disabled there).
 */
export function Reveal({
  children,
  delay = 0,
  variant = "up",
  className = "",
  as: Tag = "div",
}: RevealProps) {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <Tag
      ref={ref}
      className={`reveal reveal-${variant} ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
