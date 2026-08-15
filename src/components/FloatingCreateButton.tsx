"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "fab-position";
const FAB_SIZE = 60;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function getSavedPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {}
}

export function FloatingCreateButton() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Initialize position
  useEffect(() => {
    const saved = getSavedPosition();
    if (saved) {
      // Make sure saved position is still within viewport
      const maxX = window.innerWidth - FAB_SIZE - 8;
      const maxY = window.innerHeight - FAB_SIZE - 80; // account for bottom nav
      setPos({
        x: clamp(saved.x, 8, maxX),
        y: clamp(saved.y, 8, maxY),
      });
    } else {
      // Default: bottom-right, above the bottom nav
      setPos({
        x: window.innerWidth - FAB_SIZE - 20,
        y: window.innerHeight - FAB_SIZE - 90,
      });
    }
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const ds = dragState.current;
    if (!ds) return;

    const dx = clientX - ds.startX;
    const dy = clientY - ds.startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      ds.moved = true;
    }

    const maxX = window.innerWidth - FAB_SIZE - 8;
    const maxY = window.innerHeight - FAB_SIZE - 80;

    const newX = clamp(ds.originX + dx, 8, maxX);
    const newY = clamp(ds.originY + dy, 8, maxY);

    setPos({ x: newX, y: newY });
  }, []);

  const handleEnd = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    setDragging(false);

    // Snap to nearest edge (left or right)
    setPos((prev) => {
      if (!prev) return prev;
      const midX = window.innerWidth / 2;
      const snappedX = prev.x + FAB_SIZE / 2 < midX ? 12 : window.innerWidth - FAB_SIZE - 12;
      const final = { x: snappedX, y: prev.y };
      savePosition(final.x, final.y);
      return final;
    });

    if (!ds.moved) {
      router.push("/orders/create");
    }

    dragState.current = null;
  }, [router]);

  // Pointer events for both touch and mouse
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
      };
      setDragging(true);
    },
    [pos]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const handlePointerUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Recalculate on resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const maxX = window.innerWidth - FAB_SIZE - 8;
        const maxY = window.innerHeight - FAB_SIZE - 80;
        return {
          x: clamp(prev.x, 8, maxX),
          y: clamp(prev.y, 8, maxY),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!pos) return null;

  return (
    <button
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-[100] flex items-center justify-center rounded-full bg-primary text-white shadow-xl select-none touch-none"
      style={{
        width: FAB_SIZE,
        height: FAB_SIZE,
        left: pos.x,
        top: pos.y,
        transition: dragging ? "none" : "left 0.3s ease, top 0.1s ease",
        boxShadow: dragging
          ? "0 8px 30px rgba(59, 130, 246, 0.5)"
          : "0 4px 20px rgba(59, 130, 246, 0.35)",
        transform: dragging ? "scale(1.1)" : "scale(1)",
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
