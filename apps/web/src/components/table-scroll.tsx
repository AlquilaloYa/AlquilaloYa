"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Contenedor con scroll horizontal cuyo indicador de desplazamiento se
 * dibuja en el borde SUPERIOR de la tabla (en lugar del scrollbar inferior
 * nativo del navegador).
 */
export function TableScroll({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startPos: number } | null>(null);

  const [pos, setPos] = useState(0);
  const [max, setMax] = useState(0);
  const [ratio, setRatio] = useState(0);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setPos(scrollLeft);
    setRatio(scrollWidth > clientWidth ? clientWidth / scrollWidth : 1);
    setMax(Math.max(0, scrollWidth - clientWidth));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const scrollTo = useCallback((target: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
    setPos(el.scrollLeft);
  }, []);

  const onTrackPointerDown = (e: ReactPointerEvent) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const elMax = el.scrollWidth - el.clientWidth;
    if (elMax <= 0) return;
    const trackRect = track.getBoundingClientRect();
    const reachable = trackRect.width - trackRect.width * ratio;
    if (reachable <= 0) return;
    const fraction = (e.clientX - trackRect.left) / reachable;
    scrollTo(Math.max(0, Math.min(1, fraction)) * elMax);
  };

  const onThumbPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { startX: e.clientX, startPos: el.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onThumbPointerMove = (e: ReactPointerEvent) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!el || !track || !drag) return;
    const elMax = el.scrollWidth - el.clientWidth;
    const reachable = track.clientWidth - track.clientWidth * ratio;
    if (elMax <= 0 || reachable <= 0) return;
    const dxFraction = (e.clientX - drag.startX) / reachable;
    scrollTo(drag.startPos + dxFraction * elMax);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const thumbWidthPct = ratio > 0 && ratio < 1 ? Math.max(4, ratio * 100) : 0;
  const thumbTravelPct = 100 - thumbWidthPct;
  const thumbPosPct = max > 0 ? (pos / max) * thumbTravelPct : 0;

  return (
    <div className={className}>
      {ratio < 1 ? (
        <div
          ref={trackRef}
          className="h-2 w-full cursor-pointer touch-none select-none rounded-full bg-surface-variant/60"
          onPointerDown={onTrackPointerDown}
        >
          <div
            className="relative h-full rounded-full bg-primary/50 transition-colors hover:bg-primary/70"
            style={{ width: `${thumbWidthPct}%`, left: `${thumbPosPct}%` }}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      ) : null}
      <div ref={scrollRef} onScroll={measure} className={"table-scroll-viewport overflow-auto " + (contentClassName ?? "")}>
        {children}
      </div>
    </div>
  );
}