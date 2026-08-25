"use client";

import { useState, useRef, useCallback } from "react";

interface ImageLightboxProps {
  images: string[];
  alt: string;
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, alt, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });

  const src = images[currentIndex];
  const hasMultiple = images.length > 1;

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const goTo = (index: number) => {
    setCurrentIndex(index);
    resetZoom();
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(Math.max(s - e.deltaY * 0.002, 0.5), 5));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }, [scale, position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2.5);
    }
  }, [scale]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const zoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - 0.5, 0.5);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30"
      >
        &times;
      </button>

      {/* Image counter */}
      {hasMultiple && (
        <div className="absolute top-4 left-4 z-10 bg-white/20 backdrop-blur rounded-full px-3 py-1">
          <span className="text-white text-sm font-medium">{currentIndex + 1} / {images.length}</span>
        </div>
      )}

      {/* Nav arrows */}
      {hasMultiple && currentIndex > 0 && (
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30"
        >
          ‹
        </button>
      )}
      {hasMultiple && currentIndex < images.length - 1 && (
        <button
          onClick={() => goTo(currentIndex + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30"
        >
          ›
        </button>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0 z-10 flex flex-col items-center gap-3 pb-8">
        {/* Thumbnail dots */}
        {hasMultiple && (
          <div className="flex gap-2">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
                  i === currentIndex ? "border-white" : "border-white/30 opacity-60"
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Zoom slider */}
        <div className="flex items-center gap-3 bg-white/20 backdrop-blur rounded-full px-4 py-2.5">
          <button onClick={zoomOut} className="text-white text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">-</button>
          <input
            type="range"
            min={50}
            max={500}
            step={10}
            value={Math.round(scale * 100)}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setScale(next);
              if (next <= 1) setPosition({ x: 0, y: 0 });
            }}
            className="w-32 sm:w-48 accent-white h-1.5 rounded-full appearance-none bg-white/30 cursor-pointer"
          />
          <button onClick={zoomIn} className="text-white text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">+</button>
          <span className="text-white text-xs font-medium min-w-[2.5rem] text-center">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* Image */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[75vh] object-contain select-none pointer-events-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.2s ease",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
