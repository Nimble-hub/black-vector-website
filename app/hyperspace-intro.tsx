"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  brightness: number;
};

const DURATION = 15000;
const SEEN_KEY = "black-vector-jump-seen-v3";

function easeInCubic(value: number) {
  return value * value * value;
}

export function HyperspaceIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const finish = useCallback(() => {
    setExiting(true);
    window.sessionStorage.setItem(SEEN_KEY, "true");
    window.setTimeout(() => setVisible(false), 520);
  }, []);

  const replay = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setExiting(false);
    setVisible(true);
    setRunId((value) => value + 1);
  }, []);

  useEffect(() => {
    const replayButtons = document.querySelectorAll<HTMLElement>("[data-replay-jump]");
    replayButtons.forEach((button) => button.addEventListener("click", replay));
    return () => replayButtons.forEach((button) => button.removeEventListener("click", replay));
  }, [replay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && visible) finish();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, visible]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((window.sessionStorage.getItem(SEEN_KEY) && runId === 0) || reducedMotion) {
      setVisible(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let startTime = 0;
    let lastTime = 0;

    const makeStars = () => {
      const count = width < 720 ? 260 : 520;
      stars = Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 2.4,
        y: (Math.random() - 0.5) * 1.7,
        z: 0.18 + Math.random() * 0.92,
        brightness: 0.35 + Math.random() * 0.65,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      makeStars();
    };

    const draw = (time: number) => {
      if (!startTime) {
        startTime = time;
        lastTime = time;
      }

      const elapsed = time - startTime;
      const delta = Math.min(time - lastTime, 34) / 1000;
      const progress = Math.min(elapsed / DURATION, 1);
      lastTime = time;

      let speed = 0.025;
      if (progress > 0.1 && progress < 0.25) {
        speed = 0.04 + easeInCubic((progress - 0.1) / 0.15) * 1.48;
      } else if (progress >= 0.25 && progress < 0.82) {
        speed = 1.52 + Math.sin(progress * Math.PI * 8) * 0.08;
      } else if (progress >= 0.82 && progress < 0.9) {
        speed = 1.62 + easeInCubic((progress - 0.82) / 0.08) * 0.78;
      } else if (progress >= 0.9) {
        speed = Math.max(0.035, 2.4 * (1 - (progress - 0.9) / 0.1));
      }

      const transit = Math.max(0, Math.min(1, (progress - 0.13) / 0.18));
      context.fillStyle = transit > 0.08 ? "#020713" : "#020305";
      context.fillRect(0, 0, width, height);
      const centerX = width * 0.5;
      const centerY = height * 0.48;
      const focal = Math.min(width, height) * 0.58;

      context.globalCompositeOperation = "lighter";
      for (const star of stars) {
        const previousZ = star.z;
        star.z -= speed * delta;
        if (star.z < 0.045) {
          star.z += 1.05;
          star.x = (Math.random() - 0.5) * 2.4;
          star.y = (Math.random() - 0.5) * 1.7;
        }

        const x = centerX + (star.x / star.z) * focal;
        const y = centerY + (star.y / star.z) * focal;
        const tailZ = Math.min(1.25, previousZ + speed * (0.055 + transit * 0.055));
        const tailX = centerX + (star.x / tailZ) * focal;
        const tailY = centerY + (star.y / tailZ) * focal;
        const alpha = Math.min(0.92, star.brightness * (1.08 - star.z));
        const cyan = star.brightness > 0.82;

        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.strokeStyle = cyan
          ? `rgba(68, 202, 209, ${alpha})`
          : `rgba(231, 226, 214, ${alpha})`;
        context.lineWidth = Math.max(0.55, (1.08 - star.z) * 2.15);
        context.stroke();
      }

      const charge = Math.max(0, Math.min(1, (progress - 0.12) / 0.16));
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.42);
      glow.addColorStop(0, `rgba(231, 249, 255, ${charge * 0.32})`);
      glow.addColorStop(0.08, `rgba(80, 160, 255, ${charge * 0.2})`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      if (progress > 0.88 && progress < 0.94) {
        const flashProgress = (progress - 0.88) / 0.06;
        const flash = Math.sin(flashProgress * Math.PI) * 0.82;
        context.fillStyle = `rgba(231, 246, 248, ${flash})`;
        context.fillRect(0, 0, width, height);
      }

      context.globalCompositeOperation = "source-over";

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(draw);
      } else {
        finish();
      }
    };

    resize();
    window.addEventListener("resize", resize);
    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [finish, runId]);

  if (!visible) return null;

  return (
    <div
      className={`jump-intro${exiting ? " is-exiting" : ""}`}
      aria-label="Hyperspace jump loading sequence"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
