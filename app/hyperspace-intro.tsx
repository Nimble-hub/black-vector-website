"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HyperspaceIntro2D } from "./hyperspace-intro-2d";

const DURATION = 15000;
const DEPTH = 132;
const NEAR = 0.68;
const SEEN_KEY = "black-vector-jump-seen-3d-v1";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

const vertexShader = `
  precision highp float;

  attribute float aAngle;
  attribute float aRadius;
  attribute float aSeedZ;
  attribute float aLength;
  attribute float aWidth;
  attribute float aBrightness;
  attribute float aHue;

  uniform float uTravel;
  uniform float uDepth;
  uniform float uNear;
  uniform vec2 uResolution;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;

  void main() {
    float travel = mod(aSeedZ + uTravel, uDepth);
    float headZ = min(-uDepth + travel, -uNear);
    float tailZ = headZ - aLength;
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius;

    vec4 clipTail = projectionMatrix * modelViewMatrix * vec4(radial, tailZ, 1.0);
    vec4 clipHead = projectionMatrix * modelViewMatrix * vec4(radial, headZ, 1.0);
    vec2 ndcTail = clipTail.xy / clipTail.w;
    vec2 ndcHead = clipHead.xy / clipHead.w;
    vec2 screenTail = ndcTail * uResolution * 0.5;
    vec2 screenHead = ndcHead * uResolution * 0.5;
    vec2 direction = normalize(screenHead - screenTail + vec2(0.00001));
    vec2 perpendicular = vec2(-direction.y, direction.x);

    float along = uv.y;
    vec2 screenPosition = mix(screenTail, screenHead, along);
    screenPosition += perpendicular * uv.x * aWidth;
    vec2 ndcPosition = screenPosition / (uResolution * 0.5);
    float clipW = mix(clipTail.w, clipHead.w, along);
    float ndcZ = mix(clipTail.z / clipTail.w, clipHead.z / clipHead.w, along);

    gl_Position = vec4(ndcPosition * clipW, ndcZ * clipW, clipW);
    vRibbonUv = uv;
    vBrightness = aBrightness;
    vHue = aHue;
    vDepthFade = smoothstep(0.0, 7.0, travel) * (1.0 - smoothstep(uDepth - 4.5, uDepth, travel));
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;

  void main() {
    float edge = 1.0 - smoothstep(0.18, 1.0, abs(vRibbonUv.x));
    float tailFade = smoothstep(0.0, 0.12, vRibbonUv.y);
    float headFade = 1.0 - smoothstep(0.985, 1.0, vRibbonUv.y);
    float longitudinal = tailFade * headFade;
    float hotCore = 1.0 - smoothstep(0.0, 0.32, abs(vRibbonUv.x));
    float headExposure = mix(0.34, 1.0, pow(vRibbonUv.y, 0.48));

    vec3 coldBlue = vec3(0.34, 0.67, 1.0);
    vec3 photographicWhite = vec3(0.93, 0.985, 1.0);
    vec3 color = mix(coldBlue, photographicWhite, vHue);
    float intensity = vBrightness * headExposure * (1.28 + hotCore * 2.45);
    float alpha = edge * longitudinal * vDepthFade;

    gl_FragColor = vec4(color * intensity, alpha);
  }
`;

const filmicCameraShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFlash;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float random(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233)) + uTime * 41.17) * 43758.5453);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      vec2 lens = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float vignette = smoothstep(0.34, 0.82, dot(lens, lens));
      color *= mix(1.0, 0.57, vignette);
      float grain = random(gl_FragCoord.xy) - 0.5;
      color += grain * 0.018;
      color = mix(color, vec3(0.94, 0.985, 1.0), uFlash);
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

function createTunnelGeometry(count: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -1, 0, 0,
      1, 0, 0,
      1, 1, 0,
      -1, 1, 0,
    ], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([
      -1, 0,
      1, 0,
      1, 1,
      -1, 1,
    ], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const angles = new Float32Array(count);
  const radii = new Float32Array(count);
  const seeds = new Float32Array(count);
  const lengths = new Float32Array(count);
  const widths = new Float32Array(count);
  const brightness = new Float32Array(count);
  const hues = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const light = 0.64 + Math.random() * 0.36;
    angles[index] = Math.random() * Math.PI * 2;
    radii[index] = 2.8 + Math.pow(Math.random(), 0.68) * 13.2;
    seeds[index] = Math.random() * DEPTH;
    lengths[index] = 4.8 + Math.pow(Math.random(), 0.6) * 10.5;
    widths[index] = 0.58 + light * (0.72 + Math.random() * 0.72);
    brightness[index] = light;
    hues[index] = Math.random() < 0.14 ? Math.random() * 0.28 : 0.82 + Math.random() * 0.18;
  }

  geometry.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angles, 1));
  geometry.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radii, 1));
  geometry.setAttribute("aSeedZ", new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute("aLength", new THREE.InstancedBufferAttribute(lengths, 1));
  geometry.setAttribute("aWidth", new THREE.InstancedBufferAttribute(widths, 1));
  geometry.setAttribute("aBrightness", new THREE.InstancedBufferAttribute(brightness, 1));
  geometry.setAttribute("aHue", new THREE.InstancedBufferAttribute(hues, 1));
  geometry.instanceCount = count;
  return geometry;
}

export function HyperspaceIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finishTimerRef = useRef<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [fallback, setFallback] = useState(false);

  const finish = useCallback(() => {
    setExiting(true);
    window.sessionStorage.setItem(SEEN_KEY, "true");
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => setVisible(false), 620);
  }, []);

  const replay = useCallback(() => {
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
    if (fallback || !visible) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((window.sessionStorage.getItem(SEEN_KEY) && runId === 0) || reducedMotion) {
      setVisible(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      setFallback(true);
      return;
    }

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000104);
    const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 160);
    camera.position.set(0, 0, 0);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const uniforms = {
      uTravel: { value: 0 },
      uDepth: { value: DEPTH },
      uNear: { value: NEAR },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const geometry = createTunnelGeometry(isMobile ? 1500 : 2600);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const tunnel = new THREE.Mesh(geometry, material);
    tunnel.frustumCulled = false;
    tunnel.matrixAutoUpdate = false;
    tunnel.updateMatrix();
    scene.add(tunnel);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), isMobile ? 0.72 : 0.94, 0.28, 0.64);
    composer.addPass(bloomPass);
    const filmPass = new ShaderPass(filmicCameraShader);
    composer.addPass(filmPass);
    composer.addPass(new OutputPass());

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const largeFrame = width * height > 3_000_000;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, largeFrame ? 1.2 : isMobile ? 1.35 : 1.65);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      filmPass.uniforms.uResolution.value.set(width, height);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      renderer.setAnimationLoop(null);
      setFallback(true);
    };

    let startTime = 0;
    let previousTime = 0;
    let travel = 0;
    const animate = (time: number) => {
      if (!startTime) {
        startTime = time;
        previousTime = time;
      }

      const elapsed = time - startTime;
      const progress = clamp01(elapsed / DURATION);
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;

      const exitBoost = smoothstep((progress - 0.8) / 0.11);
      const braking = smoothstep((progress - 0.92) / 0.08);
      const speed = (25.5 + exitBoost * 10.5) * (1 - braking) + 0.35 * braking;
      travel += speed * delta;
      uniforms.uTravel.value = travel;

      camera.position.x = Math.sin(elapsed * 0.00023) * 0.018;
      camera.position.y = Math.cos(elapsed * 0.00019) * 0.014;
      camera.rotation.z = Math.sin(elapsed * 0.00013) * 0.0018;

      let flash = 0;
      if (progress > 0.87 && progress < 0.955) {
        const phase = (progress - 0.87) / 0.085;
        flash = smoothstep(phase / 0.44) * (1 - smoothstep((phase - 0.44) / 0.56)) * 0.96;
      }
      filmPass.uniforms.uTime.value = elapsed / 1000;
      filmPass.uniforms.uFlash.value = flash;
      composer.render(delta);

      if (progress >= 1) {
        renderer.setAnimationLoop(null);
        finish();
      }
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", onContextLost);
    renderer.setAnimationLoop(animate);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.remove(tunnel);
      geometry.dispose();
      material.dispose();
      bloomPass.dispose();
      filmPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [fallback, finish, runId, visible]);

  useEffect(() => () => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  }, []);

  if (fallback) return <HyperspaceIntro2D />;
  if (!visible) return null;

  return (
    <div
      className={`jump-intro jump-intro-3d${exiting ? " is-exiting" : ""}`}
      aria-label="Three-dimensional hyperspace transit sequence"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
