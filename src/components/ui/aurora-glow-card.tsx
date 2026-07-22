"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type AuroraGlowCardTone = "strong" | "soft";

type AuroraGlowCardProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  tone?: AuroraGlowCardTone;
};

const BORDER_BACKGROUND_BY_TONE: Record<AuroraGlowCardTone, string> = {
  strong:
    "radial-gradient(220px circle at var(--aurora-x, 50%) var(--aurora-y, 50%), rgba(255,255,255,1), rgba(255,255,255,0.96) 12%, rgba(196,181,253,0.78) 24%, rgba(191,219,254,0.68) 38%, rgba(244,214,255,0.38) 54%, rgba(255,255,255,0) 76%), linear-gradient(140deg, rgba(255,255,255,0.7), rgba(191,219,254,0.34), rgba(196,181,253,0.3), rgba(255,255,255,0.46))",
  soft:
    "radial-gradient(180px circle at var(--aurora-x, 50%) var(--aurora-y, 50%), rgba(255,255,255,0.9), rgba(255,255,255,0.78) 14%, rgba(196,181,253,0.42) 26%, rgba(191,219,254,0.34) 40%, rgba(244,214,255,0.2) 54%, rgba(255,255,255,0) 74%), linear-gradient(140deg, rgba(255,255,255,0.38), rgba(191,219,254,0.18), rgba(196,181,253,0.16), rgba(255,255,255,0.28))",
};

const BORDER_SHADOW_BY_TONE: Record<AuroraGlowCardTone, string> = {
  strong: "0 0 0 1.5px rgba(255,255,255,0.44), 0 0 28px rgba(191,219,254,0.28), 0 0 42px rgba(196,181,253,0.2)",
  soft: "0 0 0 1.25px rgba(255,255,255,0.24), 0 0 20px rgba(191,219,254,0.16), 0 0 30px rgba(196,181,253,0.1)",
};

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function AuroraGlowCard({
  children,
  className,
  disabled = false,
  tone = "strong",
}: AuroraGlowCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  const updatePointerPosition = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    node.style.setProperty("--aurora-x", `${x}%`);
    node.style.setProperty("--aurora-y", `${y}%`);
  }, []);

  const handlePointerEnter = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || event.pointerType !== "mouse") {
        return;
      }

      setActive(true);
      updatePointerPosition(event);
    },
    [disabled, updatePointerPosition],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || event.pointerType !== "mouse") {
        return;
      }

      updatePointerPosition(event);
    },
    [disabled, updatePointerPosition],
  );

  const handlePointerLeave = useCallback(() => {
    setActive(false);
  }, []);

  const shouldShowGlow = !disabled && active;
  const glowOpacity = reduceMotion ? 0.8 : 1;

  const borderStyle: CSSProperties = {
    background: BORDER_BACKGROUND_BY_TONE[tone],
    WebkitMask:
      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
  };

  return (
    <div
      ref={containerRef}
      className={classNames("relative", className)}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        aria-hidden="true"
        className={classNames(
          "pointer-events-none absolute -inset-[1.5px] rounded-[inherit] p-[1.5px] transition-opacity duration-300",
          shouldShowGlow ? "opacity-100" : "opacity-0",
        )}
        style={{
          ...borderStyle,
          boxShadow: BORDER_SHADOW_BY_TONE[tone],
          opacity: shouldShowGlow ? glowOpacity : 0,
        }}
      />

      <div className="relative z-[1] h-full">{children}</div>
    </div>
  );
}
