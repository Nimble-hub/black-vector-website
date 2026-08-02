"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  brightness: number;
};

const DURATION = 3300;
const SEEN_KEY = "black-vector-jump-seen";

function easeInCubic(value: number) {
  return value * value * value;
}

export function HyperspaceIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [status, setStatus] = useState("CALIBRATING VECTOR");

  const finish = useCallback(() => {
    setExiting(true);
    window.sessionStorage.setItem(SEEN_KEY, "true");
    window.setTimeout(() => setVisible(false), 520);
  }, []);

  const replay = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setStatus("CALIBRATING VECTOR");
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
    let announcedJump = false;

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

      let speed = 0.03;
      if (progress > 0.1 && progress < 0.68) {
        speed = 0.06 + easeInCubic((progress - 0.1) / 0.58) * 1.85;
      } else if (progress >= 0.68 && progress < 0.82) {
        speed = 2.05;
      } else if (progress >= 0.82) {
        speed = Math.max(0.05, 2.05 * (1 - (progress - 0.82) / 0.18));
      }

      if (progress > 0.28 && !announcedJump) {
        announcedJump = true;
        setStatus("VECTOR LOCKED // JUMPING");
      }

      context.fillStyle = "#020305";
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
        const tailZ = Math.min(1.2, previousZ + speed * 0.04);
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

      const charge = Math.max(0, Math.min(1, (progress - 0.48) / 0.3));
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.42);
      glow.addColorStop(0, `rgba(231, 249, 255, ${charge * 0.28})`);
      glow.addColorStop(0.08, `rgba(68, 202, 209, ${charge * 0.12})`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      if (progress > 0.73 && progress < 0.84) {
        const flashProgress = (progress - 0.73) / 0.11;
        const flash = Math.sin(flashProgress * Math.PI) * 0.76;
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
      <div className="jump-interface">
        <div className="jump-reticle" aria-hidden="true"><span /></div>
        <p className="jump-status" aria-live="polite">{status}</p>
        <button className="skip-jump" type="button" onClick={finish}>
          SKIP JUMP <span aria-hidden="true">ESC</span>
        </button>
      </div>
    </div>
  );
}
