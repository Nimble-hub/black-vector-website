"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  brightness: number;
};

const DURATION = 15000;
const SEEN_KEY = "black-vector-jump-seen-v6";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
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
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    let stars: Star[] = [];
    let startTime = 0;
    let lastTime = 0;

    const makeStars = () => {
      const count = width < 720 ? 340 : 620;
      stars = Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 2.55,
        y: (Math.random() - 0.5) * 1.82,
        z: 0.18 + Math.random() * 0.92,
        brightness: 0.52 + Math.random() * 0.48,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.35 : 1.6);
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
      const delta = Math.min(time - lastTime, 50) / 1000;
      const progress = Math.min(elapsed / DURATION, 1);
      lastTime = time;

      const exitBoost = smoothstep((progress - 0.8) / 0.105);
      const braking = smoothstep((progress - 0.915) / 0.085);
      const trailStrength = 1 - smoothstep((progress - 0.94) / 0.06);
      const cruiseSpeed = 2.73 + Math.sin(progress * Math.PI * 5) * 0.055 + exitBoost * 0.94;
      const speed = cruiseSpeed * (1 - braking) + 0.04 * braking;
      const transit = 1 - smoothstep((progress - 0.96) / 0.04);

      context.fillStyle = "#020305";
      context.fillRect(0, 0, width, height);
      const centerX = width * 0.5;
      const centerY = height * 0.48;
      const focal = Math.min(width, height) * 0.65;

      if (transit > 0) {
        const fieldGlow = context.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          Math.max(width, height) * 0.74,
        );
        fieldGlow.addColorStop(0, `rgba(180, 224, 255, ${transit * 0.16})`);
        fieldGlow.addColorStop(0.16, `rgba(62, 130, 230, ${transit * 0.17})`);
        fieldGlow.addColorStop(0.6, `rgba(5, 34, 86, ${transit * 0.24})`);
        fieldGlow.addColorStop(1, "rgba(0, 4, 16, 0)");
        context.fillStyle = fieldGlow;
        context.fillRect(0, 0, width, height);
      }

      const whitePaths = [new Path2D(), new Path2D(), new Path2D()];
      const bluePaths = [new Path2D(), new Path2D(), new Path2D()];
      const glowPaths = [new Path2D(), new Path2D(), new Path2D()];

      for (const star of stars) {
        const previousZ = star.z;
        star.z -= speed * delta;
        if (star.z < 0.045) {
          star.z += 1.05;
          star.x = (Math.random() - 0.5) * 2.55;
          star.y = (Math.random() - 0.5) * 1.82;
        }

        const x = centerX + (star.x / star.z) * focal;
        const y = centerY + (star.y / star.z) * focal;
        const tailZ = Math.min(1.35, previousZ + speed * (0.018 + trailStrength * 0.135));
        const tailX = centerX + (star.x / tailZ) * focal;
        const tailY = centerY + (star.y / tailZ) * focal;
        const depth = star.z < 0.24 ? 2 : star.z < 0.56 ? 1 : 0;
        const path = star.brightness < 0.7 ? bluePaths[depth] : whitePaths[depth];

        path.moveTo(tailX, tailY);
        path.lineTo(x, y);
        if (star.brightness > 0.64) {
          glowPaths[depth].moveTo(tailX, tailY);
          glowPaths[depth].lineTo(x, y);
        }
      }

      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      const crispWidths = [0.75, 1.45, 2.55];
      const glowWidths = [3.2, 6.4, 11.5];
      const depthAlpha = [0.5, 0.72, 0.96];

      for (let depth = 0; depth < 3; depth += 1) {
        context.globalAlpha = trailStrength * (0.08 + depth * 0.055);
        context.strokeStyle = "#4d97ff";
        context.lineWidth = glowWidths[depth];
        context.stroke(glowPaths[depth]);
      }

      for (let depth = 0; depth < 3; depth += 1) {
        context.globalAlpha = depthAlpha[depth] * (0.72 + transit * 0.28);
        context.lineWidth = crispWidths[depth] * (0.82 + trailStrength * 0.3);
        context.strokeStyle = "#82c9ff";
        context.stroke(bluePaths[depth]);
        context.strokeStyle = "#effaff";
        context.stroke(whitePaths[depth]);
      }

      context.globalAlpha = 1;

      const charge = 1 - smoothstep((progress - 0.95) / 0.05);
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.5);
      glow.addColorStop(0, `rgba(244, 252, 255, ${charge * 0.48})`);
      glow.addColorStop(0.055, `rgba(147, 208, 255, ${charge * 0.28})`);
      glow.addColorStop(0.24, `rgba(44, 116, 225, ${charge * 0.14})`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const vignette = context.createRadialGradient(
        centerX,
        centerY,
        Math.min(width, height) * 0.24,
        centerX,
        centerY,
        Math.max(width, height) * 0.72,
      );
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(0.68, "rgba(0, 2, 12, 0.08)");
      vignette.addColorStop(1, `rgba(0, 2, 12, ${0.48 - transit * 0.16})`);
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      if (progress > 0.87 && progress < 0.95) {
        const flashProgress = (progress - 0.87) / 0.08;
        const flashIn = smoothstep(flashProgress / 0.46);
        const flashOut = 1 - smoothstep((flashProgress - 0.46) / 0.54);
        const flash = flashIn * flashOut * 0.96;
        context.fillStyle = `rgba(239, 249, 255, ${flash})`;
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
