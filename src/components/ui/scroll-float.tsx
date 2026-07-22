"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type ScrollFloatProps = {
  children: ReactNode;
  containerClassName?: string;
  textClassName?: string;
  animationDuration?: number;
  stagger?: number;
};

export function ScrollFloat({
  children,
  containerClassName = "",
  textClassName = "",
  animationDuration = 0.9,
  stagger = 0.018,
}: ScrollFloatProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split("").map((char, index) => (
      <span
        key={`${char}-${index}`}
        className="scroll-float-char"
        style={{ transitionDelay: `${index * stagger}s` }}
      >
        {char === " " ? "\u00A0" : char}
      </span>
    ));
  }, [children, stagger]);

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
        threshold: 0.2,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`scroll-float-container ${isVisible ? "is-visible" : ""} ${containerClassName}`.trim()}
      style={{ ["--scroll-float-duration" as string]: `${animationDuration}s` } as CSSProperties}
    >
      <span className={`scroll-float-text ${textClassName}`.trim()}>{splitText}</span>
    </div>
  );
}

