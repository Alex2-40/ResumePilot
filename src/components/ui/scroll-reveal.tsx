"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  enableBlur?: boolean;
  baseOpacity?: number;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
};

export function ScrollReveal({
  children,
  enableBlur = true,
  baseOpacity = 0.14,
  blurStrength = 10,
  containerClassName = "",
  textClassName = "",
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split(/(\s+)/).map((word, index) => {
      if (/^\s+$/.test(word)) {
        return word;
      }

      return (
        <span
          key={`${word}-${index}`}
          className="scroll-reveal-word"
          style={{ transitionDelay: `${index * 38}ms` }}
        >
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.25,
        rootMargin: "0px 0px -12% 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`scroll-reveal-container ${isVisible ? "is-visible" : ""} ${containerClassName}`.trim()}
      style={
        {
          ["--scroll-reveal-base-opacity" as string]: baseOpacity,
          ["--scroll-reveal-blur" as string]: `${enableBlur ? blurStrength : 0}px`,
        } as CSSProperties
      }
    >
      <div className={`scroll-reveal-text ${textClassName}`.trim()}>{splitText}</div>
    </div>
  );
}
