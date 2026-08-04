"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getHyperspaceProgress } from "./hyperspace-timeline";

type Star = {
  x: number;
  y: number;
  z: number;
  brightness: number;
};

const SEEN_KEY = "black-vector-jump-seen-v13";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function HyperspaceIntro2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "hyperspace-scroll-lock",
      visible,
    );
    return () => {
      document.documentElement.classList.remove("hyperspace-scroll-lock");
    };
  }, [visible]);

  const finish = useCallback(() => {
    window.sessionStorage.setItem(SEEN_KEY, "true");
    document.documentElement.classList.add("experience-landed");
    setVisible(false);
  }, []);

  const replay = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    document.documentElement.classList.remove("experience-landed");
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
      document.documentElement.classList.add("experience-landed");
      const settleTimer = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(settleTimer);
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

    const placeOnTunnelWall = (star: Star, z?: number) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.075 + Math.pow(Math.random(), 0.72) * 1.28;
      const horizontalScale = Math.max(1.05, Math.min(1.55, (width / height) * 0.82));
      star.x = Math.cos(angle) * radius * horizontalScale;
      star.y = Math.sin(angle) * radius * 0.92;
      star.z = z ?? 0.18 + Math.random() * 0.92;
    };

    const makeStars = () => {
      const count = width < 720 ? 520 : 960;
      stars = Array.from({ length: count }, () => {
        const star: Star = {
          x: 0,
          y: 0,
          z: 1,
          brightness: 0.52 + Math.random() * 0.48,
        };
        placeOnTunnelWall(star);
        return star;
      });
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelBudget = width * height > 3_000_000 ? 1.3 : width < 720 ? 1.5 : 1.8;
      pixelRatio = Math.min(window.devicePixelRatio || 1, pixelBudget);
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
      const progress = getHyperspaceProgress(elapsed);
      lastTime = time;

      const exitBoost = smoothstep((progress - 0.8) / 0.105);
      const braking = smoothstep((progress - 0.915) / 0.085);
      const trailStrength = 1 - smoothstep((progress - 0.94) / 0.06);
      const cruiseSpeed = 2.73 + Math.sin(progress * Math.PI * 5) * 0.055 + exitBoost * 0.94;
      const speed = cruiseSpeed * (1 - braking) + 0.04 * braking;
      const transit = 1 - smoothstep((progress - 0.96) / 0.04);

      context.fillStyle = "#000104";
      context.fillRect(0, 0, width, height);
      const lensBreath = Math.sin(elapsed * 0.00027) * 0.0022;
      const centerX = width * (0.5 + Math.sin(elapsed * 0.00019) * 0.0015);
      const centerY = height * (0.48 + Math.cos(elapsed * 0.00017) * 0.0013);
      const focal = Math.min(width, height) * 0.65 * (1 + lensBreath);

      const tailWhitePaths = [new Path2D(), new Path2D(), new Path2D()];
      const tailBluePaths = [new Path2D(), new Path2D(), new Path2D()];
      const headWhitePaths = [new Path2D(), new Path2D(), new Path2D()];
      const headBluePaths = [new Path2D(), new Path2D(), new Path2D()];
      const glowPaths = [new Path2D(), new Path2D(), new Path2D()];

      for (const star of stars) {
        const previousZ = star.z;
        star.z -= speed * delta;
        if (star.z < 0.045) {
          star.z += 1.05;
          placeOnTunnelWall(star, star.z);
          star.brightness = 0.52 + Math.random() * 0.48;
        }

        const x = centerX + (star.x / star.z) * focal;
        const y = centerY + (star.y / star.z) * focal;
        const tailZ = Math.min(1.35, previousZ + speed * (0.018 + trailStrength * 0.135));
        const tailX = centerX + (star.x / tailZ) * focal;
        const tailY = centerY + (star.y / tailZ) * focal;
        const depth = star.z < 0.24 ? 2 : star.z < 0.56 ? 1 : 0;
        const blue = star.brightness < 0.62;
        const tailPath = blue ? tailBluePaths[depth] : tailWhitePaths[depth];
        const headPath = blue ? headBluePaths[depth] : headWhitePaths[depth];
        const splitX = tailX + (x - tailX) * 0.48;
        const splitY = tailY + (y - tailY) * 0.48;

        tailPath.moveTo(tailX, tailY);
        tailPath.lineTo(splitX, splitY);
        headPath.moveTo(splitX, splitY);
        headPath.lineTo(x, y);
        if (star.brightness > 0.64) {
          glowPaths[depth].moveTo(tailX, tailY);
          glowPaths[depth].lineTo(x, y);
        }
      }

      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      const crispWidths = [0.85, 1.6, 2.9];
      const glowWidths = [3.8, 7.2, 13];
      const depthAlpha = [0.58, 0.8, 1];
      const exposure = 0.986 + Math.sin(elapsed * 0.0011) * 0.006 + Math.sin(elapsed * 0.0027) * 0.003;

      for (let depth = 0; depth < 3; depth += 1) {
        context.globalAlpha = trailStrength * (0.11 + depth * 0.075);
        context.strokeStyle = "#4d97ff";
        context.lineWidth = glowWidths[depth];
        context.filter = depth === 0 ? "blur(1.8px)" : "blur(1px)";
        context.stroke(glowPaths[depth]);
      }

      for (let depth = 0; depth < 3; depth += 1) {
        context.filter = "none";
        context.globalAlpha = depthAlpha[depth] * 0.58 * exposure;
        context.lineWidth = crispWidths[depth] * (0.62 + trailStrength * 0.2);
        context.strokeStyle = "#559ce5";
        context.stroke(tailBluePaths[depth]);
        context.strokeStyle = "#a9d9f4";
        context.stroke(tailWhitePaths[depth]);

        context.globalAlpha = depthAlpha[depth] * (0.82 + transit * 0.18) * exposure;
        context.lineWidth = crispWidths[depth] * (0.9 + trailStrength * 0.34);
        context.strokeStyle = "#b7deff";
        context.stroke(headBluePaths[depth]);
        context.strokeStyle = "#ffffff";
        context.stroke(headWhitePaths[depth]);
      }

      const coreWidths = [0.42, 0.72, 1.15];
      for (let depth = 0; depth < 3; depth += 1) {
        context.globalAlpha = depthAlpha[depth] * 0.94 * exposure;
        context.lineWidth = coreWidths[depth];
        context.strokeStyle = "#eaf7ff";
        context.stroke(headBluePaths[depth]);
        context.strokeStyle = "#ffffff";
        context.stroke(headWhitePaths[depth]);
      }

      context.filter = "none";
      context.globalAlpha = 1;

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
      className="jump-intro"
      aria-label="Hyperspace jump loading sequence"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
