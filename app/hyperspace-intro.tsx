"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  brightness: number;
};

const DURATION = 15000;
const SEEN_KEY = "black-vector-jump-seen-v4";

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
      const count = width < 720 ? 440 : 860;
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

      let speed = 0.035;
      if (progress > 0.065 && progress < 0.17) {
        speed = 0.08 + easeInCubic((progress - 0.065) / 0.105) * 2.72;
      } else if (progress >= 0.17 && progress < 0.86) {
        speed = 2.74 + Math.sin(progress * Math.PI * 12) * 0.14;
      } else if (progress >= 0.86 && progress < 0.925) {
        speed = 2.9 + easeInCubic((progress - 0.86) / 0.065) * 0.95;
      } else if (progress >= 0.925) {
        speed = Math.max(0.04, 3.85 * (1 - (progress - 0.925) / 0.075));
      }

      const transit = Math.max(0, Math.min(1, (progress - 0.055) / 0.12));
      context.fillStyle = transit > 0.05 ? "#010817" : "#020305";
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

      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
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
        const tailZ = Math.min(1.35, previousZ + speed * (0.025 + transit * 0.13));
        const tailX = centerX + (star.x / tailZ) * focal;
        const tailY = centerY + (star.y / tailZ) * focal;
        const alpha = Math.min(1, star.brightness * (1.24 - star.z) * (0.72 + transit * 0.38));
        const cyan = star.brightness < 0.72;
        const lineWidth = Math.max(0.75, (1.12 - star.z) * (2.25 + transit * 1.3));

        if (transit > 0.12 && star.brightness > 0.64) {
          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(x, y);
          context.strokeStyle = `rgba(75, 153, 255, ${alpha * transit * 0.2})`;
          context.lineWidth = lineWidth * 4.6;
          context.stroke();
        }

        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.strokeStyle = cyan
          ? `rgba(125, 192, 255, ${alpha})`
          : `rgba(238, 249, 255, ${alpha})`;
        context.lineWidth = lineWidth;
        context.stroke();
      }

      const charge = Math.max(0, Math.min(1, (progress - 0.07) / 0.1));
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

      if (progress > 0.89 && progress < 0.955) {
        const flashProgress = (progress - 0.89) / 0.065;
        const flash = Math.pow(Math.sin(flashProgress * Math.PI), 0.72) * 0.96;
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
