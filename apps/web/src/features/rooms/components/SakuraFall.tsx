"use client";

import { useEffect, useRef } from "react";

/**
 * Cherry-blossom petals drifting over the room, drawn on one canvas.
 *
 * Each petal falls, sways side to side and tumbles (a 3D flip faked by
 * squashing its width), with unrelated periods so no two move alike. As CSS
 * this took 54 animations whose style updates cost the main thread every
 * frame — on a slow CPU, half the frame budget. Here every petal is a
 * pre-rendered sprite, so a frame is 18 drawImage calls.
 */
const PETAL_COUNT = 18;

/** Notched sakura petal, tip pointing down, in a 20×24 box. */
const PETAL_PATH =
  "M10 23 C3.5 18 0.5 12.5 1.6 7.2 C2.4 3.2 5.4 0.8 8.1 2.6 L10 4.6 L11.9 2.6 C14.6 0.8 17.6 3.2 18.4 7.2 C19.5 12.5 16.5 18 10 23 Z";
const SPRITE_SCALE = 3; // sprite px per petal-box unit: crisp up to ~60 px petals on hi-dpi

interface Petal {
  left: number; // % of width
  fallS: number;
  swayS: number;
  flutterS: number;
  phase: number; // s, so petals start mid-air
  size: number; // css px
  drift: number; // share of width drifted while falling
  opacity: number;
}

/** Fixed, deterministic layout (same as the old CSS version). */
const PETALS: Petal[] = Array.from({ length: PETAL_COUNT }, (_, i) => {
  const depth = (i * 7) % 3; // 0 = far, 2 = near
  return {
    left: (i * 37 + 11) % 100,
    phase: (i * 2.3) % 18,
    fallS: 13 + ((i * 5) % 10) - depth * 2,
    swayS: 3.5 + ((i * 3) % 4),
    flutterS: 2.5 + ((i * 7) % 5) * 0.6,
    size: 9 + depth * 5 + ((i * 3) % 4),
    drift: (((i * 13) % 30) - 15) / 100,
    // Far petals are smaller and fainter — depth without a blur.
    opacity: 0.4 + depth * 0.22,
  };
});

function renderSprite(): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = 20 * SPRITE_SCALE;
  sprite.height = 24 * SPRITE_SCALE;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  const gradient = ctx.createRadialGradient(10, 7.2, 0, 10, 7.2, 18);
  gradient.addColorStop(0, "#fff1f6");
  gradient.addColorStop(0.55, "#fbc4dc");
  gradient.addColorStop(1, "#f472b6");
  ctx.fillStyle = gradient;
  ctx.fill(new Path2D(PETAL_PATH));
  ctx.strokeStyle = "rgba(249, 168, 212, 0.7)";
  ctx.lineWidth = 0.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.lineTo(10, 15);
  ctx.stroke();
  return sprite;
}

/** 0 → 1 → 0 opacity envelope over a fall (fade in over 8%, out after 88%). */
function fade(t: number): number {
  if (t < 0.08) return t / 0.08;
  if (t > 0.88) return (1 - t) / 0.12;
  return 1;
}

/** Painted above the room (z-[22], over the video at z-20) but never catches the pointer. */
export function SakuraFall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sprite = renderSprite();
    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const seconds = (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const petal of PETALS) {
        const t = ((seconds + petal.phase) % petal.fallS) / petal.fallS;
        const swayT = Math.sin(((seconds + petal.phase) / petal.swayS) * Math.PI * 2);
        const flutter = ((seconds + petal.phase) / petal.flutterS) * Math.PI * 2;
        const w = petal.size;
        const h = petal.size * 1.2;
        const x = (petal.left / 100) * width + petal.drift * width * t + swayT * 18;
        const y = -0.05 * height - 40 + t * (1.13 * height + 40);
        ctx.globalAlpha = petal.opacity * fade(t);
        // Tumble: rotateY ≈ squash the width; rotateX ≈ squash the height.
        const flipX = Math.cos(flutter);
        const flipY = 0.55 + 0.45 * Math.cos(flutter * 0.5);
        const angle = (swayT * 25 * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ctx.setTransform(dpr * cos * flipX, dpr * sin * flipX, -dpr * sin * flipY, dpr * cos * flipY, dpr * x, dpr * y);
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[22] h-full w-full motion-reduce:hidden"
    />
  );
}
