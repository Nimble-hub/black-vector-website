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
const SEEN_KEY = "black-vector-jump-seen-3d-v2";

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
  uniform float uOpacity;
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
    vec2 perpendicular = vec2(direction.y, -direction.x);

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

  uniform float uOpacity;

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
    float alpha = edge * longitudinal * vDepthFade * uOpacity;

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

function createDeepSpaceWorld(isMobile: boolean) {
  const group = new THREE.Group();
  const fleet = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };
  const trackMaterial = <T extends THREE.Material>(material: T) => {
    material.transparent = true;
    material.opacity = 0;
    materials.push(material);
    return material;
  };

  const starCount = isMobile ? 1500 : 2800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starColor = new THREE.Color();
  for (let index = 0; index < starCount; index += 1) {
    const radius = 22 + Math.pow(Math.random(), 0.42) * 108;
    const angle = Math.random() * Math.PI * 2;
    const elevation = (Math.random() - 0.5) * Math.PI * 0.78;
    starPositions[index * 3] = Math.cos(angle) * Math.cos(elevation) * radius;
    starPositions[index * 3 + 1] = Math.sin(elevation) * radius * 0.64;
    starPositions[index * 3 + 2] = -18 - Math.sin(angle) * Math.cos(elevation) * radius;
    starColor.set(Math.random() < 0.14 ? 0x71cde8 : 0xdde7eb);
    starColors[index * 3] = starColor.r;
    starColors[index * 3 + 1] = starColor.g;
    starColors[index * 3 + 2] = starColor.b;
  }
  const starGeometry = trackGeometry(new THREE.BufferGeometry());
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starMaterial = trackMaterial(new THREE.PointsMaterial({
    size: isMobile ? 0.105 : 0.075,
    sizeAttenuation: true,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  group.add(new THREE.Points(starGeometry, starMaterial));

  const planetMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0x101b23,
    roughness: 0.94,
    metalness: 0.04,
  }));
  const planetGeometry = trackGeometry(new THREE.SphereGeometry(12, isMobile ? 32 : 56, isMobile ? 20 : 36));
  const planet = new THREE.Mesh(planetGeometry, planetMaterial);
  planet.position.set(-19, 8, -57);
  group.add(planet);

  const atmosphereMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x318699,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const atmosphere = new THREE.Mesh(planetGeometry, atmosphereMaterial);
  atmosphere.scale.setScalar(1.035);
  atmosphere.position.copy(planet.position);
  group.add(atmosphere);

  const hullGeometry = trackGeometry(new THREE.BoxGeometry(1, 1, 1));
  const noseGeometry = trackGeometry(new THREE.ConeGeometry(1, 2.8, 4, 1));
  noseGeometry.rotateX(-Math.PI / 2);
  const engineGeometry = trackGeometry(new THREE.CircleGeometry(1, 24));
  const antennaGeometry = trackGeometry(new THREE.CylinderGeometry(0.035, 0.035, 1, 6));

  const hullMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0x3e4950,
    metalness: 0.82,
    roughness: 0.32,
  }));
  const armorMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0x151b20,
    metalness: 0.72,
    roughness: 0.48,
  }));
  const engineMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x71e5f0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));

  const createShip = (scale: number, position: THREE.Vector3, rotationY: number) => {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.scale.set(4.9, 0.62, 1.58);
    ship.add(hull);

    const upperDeck = new THREE.Mesh(hullGeometry, armorMaterial);
    upperDeck.position.set(-0.35, 0.51, 0.12);
    upperDeck.scale.set(2.65, 0.34, 0.82);
    ship.add(upperDeck);

    const portWing = new THREE.Mesh(hullGeometry, armorMaterial);
    portWing.position.set(-2.55, -0.08, 0.18);
    portWing.rotation.z = -0.1;
    portWing.scale.set(2.55, 0.18, 1.86);
    ship.add(portWing);
    const starboardWing = portWing.clone();
    starboardWing.position.x = 2.55;
    starboardWing.rotation.z = 0.1;
    ship.add(starboardWing);

    const nose = new THREE.Mesh(noseGeometry, hullMaterial);
    nose.position.z = -2.85;
    nose.scale.set(1.55, 1.55, 1.05);
    ship.add(nose);

    for (const x of [-2.1, 0, 2.1]) {
      const engine = new THREE.Mesh(engineGeometry, engineMaterial);
      engine.position.set(x, -0.05, 1.605);
      engine.scale.setScalar(x === 0 ? 0.34 : 0.27);
      ship.add(engine);
    }

    const antenna = new THREE.Mesh(antennaGeometry, armorMaterial);
    antenna.position.set(-0.55, 1.08, 0.05);
    antenna.scale.y = 1.35;
    ship.add(antenna);

    ship.position.copy(position);
    ship.rotation.set(-0.04, rotationY, -0.035);
    ship.scale.setScalar(scale);
    fleet.add(ship);
    return ship;
  };

  const flagship = createShip(1.05, new THREE.Vector3(4.5, -0.9, -18), 0.18);
  createShip(0.34, new THREE.Vector3(-7.5, 2.7, -31), -0.2);
  createShip(0.27, new THREE.Vector3(10.5, 4.2, -39), 0.28);
  createShip(0.2, new THREE.Vector3(-3.4, -4.1, -27), 0.08);
  group.add(fleet);

  const ringGeometry = trackGeometry(new THREE.TorusGeometry(7.8, 0.018, 4, 96));
  const ringMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x44cad1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const orbitalRing = new THREE.Mesh(ringGeometry, ringMaterial);
  orbitalRing.position.set(-8, -4.7, -39);
  orbitalRing.rotation.set(1.18, 0.22, 0.45);
  group.add(orbitalRing);

  const hemisphere = new THREE.HemisphereLight(0x9ad8e5, 0x030508, 1.15);
  const keyLight = new THREE.DirectionalLight(0xe7e2d6, 3.8);
  keyLight.position.set(-9, 14, 7);
  const rimLight = new THREE.PointLight(0x44cad1, 22, 68, 1.7);
  rimLight.position.set(10, -4, -5);
  group.add(hemisphere, keyLight, rimLight);

  const setOpacity = (opacity: number) => {
    const eased = clamp01(opacity);
    for (const material of materials) material.opacity = eased;
    atmosphereMaterial.opacity = eased * 0.17;
    engineMaterial.opacity = eased * 0.92;
    ringMaterial.opacity = eased * 0.46;
    starMaterial.opacity = eased * 0.82;
  };

  return { group, fleet, flagship, planet, orbitalRing, geometries, materials, setOpacity };
}

export function HyperspaceIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finishTimerRef = useRef<number | null>(null);
  const skipJumpRef = useRef(false);
  const [runId, setRunId] = useState(0);
  const [jumping, setJumping] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [fallback, setFallback] = useState(false);

  const finish = useCallback(() => {
    skipJumpRef.current = true;
    setExiting(true);
    window.sessionStorage.setItem(SEEN_KEY, "true");
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => {
      setJumping(false);
      setExiting(false);
    }, 620);
  }, []);

  const replay = useCallback(() => {
    skipJumpRef.current = false;
    setExiting(false);
    setJumping(true);
    setRunId((value) => value + 1);
  }, []);

  useEffect(() => {
    const replayButtons = document.querySelectorAll<HTMLElement>("[data-replay-jump]");
    replayButtons.forEach((button) => button.addEventListener("click", replay));
    return () => replayButtons.forEach((button) => button.removeEventListener("click", replay));
  }, [replay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && jumping) finish();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, jumping]);

  useEffect(() => {
    if (fallback) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldJump = runId > 0 || (!window.sessionStorage.getItem(SEEN_KEY) && !reducedMotion);
    skipJumpRef.current = !shouldJump;
    const settleTimer = !shouldJump
      ? window.setTimeout(() => setJumping(false), 0)
      : null;

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
      window.setTimeout(() => setFallback(true), 0);
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
      uOpacity: { value: shouldJump ? 1 : 0 },
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
      side: THREE.DoubleSide,
    });
    const tunnel = new THREE.Mesh(geometry, material);
    tunnel.frustumCulled = false;
    tunnel.matrixAutoUpdate = false;
    tunnel.updateMatrix();
    tunnel.visible = shouldJump;
    scene.add(tunnel);

    const world = createDeepSpaceWorld(isMobile);
    world.setOpacity(shouldJump ? 0 : 1);
    scene.add(world.group);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), isMobile ? 0.72 : 0.94, 0.28, 0.64);
    composer.addPass(bloomPass);
    const filmPass = new ShaderPass(filmicCameraShader);
    composer.addPass(filmPass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

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
    let jumpComplete = !shouldJump;
    let finishQueued = !shouldJump;
    const cameraTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const animate = (time: number) => {
      if (!startTime) {
        startTime = time;
        previousTime = time;
      }

      const elapsed = time - startTime;
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      let flash = 0;

      if (!jumpComplete) {
        const progress = skipJumpRef.current ? 1 : clamp01(elapsed / DURATION);
        const exitBoost = smoothstep((progress - 0.8) / 0.11);
        const braking = smoothstep((progress - 0.92) / 0.08);
        const speed = (25.5 + exitBoost * 10.5) * (1 - braking) + 0.35 * braking;
        travel += speed * delta;
        uniforms.uTravel.value = travel;
        uniforms.uOpacity.value = 1 - smoothstep((progress - 0.84) / 0.16);
        world.setOpacity(smoothstep((progress - 0.87) / 0.13));

        camera.position.x = Math.sin(elapsed * 0.00023) * 0.018;
        camera.position.y = Math.cos(elapsed * 0.00019) * 0.014;
        camera.position.z = 0;
        camera.rotation.set(0, 0, Math.sin(elapsed * 0.00013) * 0.0018);

        if (progress > 0.87 && progress < 0.97) {
          const phase = (progress - 0.87) / 0.1;
          flash = smoothstep(phase / 0.42) * (1 - smoothstep((phase - 0.42) / 0.58)) * 0.9;
        }

        if (progress >= 1) {
          jumpComplete = true;
          tunnel.visible = false;
          world.setOpacity(1);
          if (!finishQueued) {
            finishQueued = true;
            finish();
          }
        }
      } else {
        const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const scrollProgress = clamp01(window.scrollY / documentHeight);
        desiredCamera.set(
          0.7 + scrollProgress * 10.5,
          0.45 - scrollProgress * 4.8,
          7.4 - scrollProgress * 8.5,
        );
        camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, delta));
        cameraTarget.set(
          2.7 - scrollProgress * 8.4,
          -0.6 + scrollProgress * 0.8,
          -19 - scrollProgress * 17,
        );
        camera.lookAt(cameraTarget);

        world.fleet.rotation.y = Math.sin(elapsed * 0.00008) * 0.022;
        world.flagship.position.y = -0.9 + Math.sin(elapsed * 0.00034) * 0.08;
        world.planet.rotation.y = elapsed * 0.000012;
        world.orbitalRing.rotation.z = 0.45 + elapsed * 0.000025;
      }

      filmPass.uniforms.uTime.value = elapsed / 1000;
      filmPass.uniforms.uFlash.value = flash;
      composer.render(delta);
    };

    resize();

    if (shouldJump) {
      const probeTarget = new THREE.WebGLRenderTarget(64, 36, {
        depthBuffer: false,
        stencilBuffer: false,
      });
      const probePixels = new Uint8Array(64 * 36 * 4);
      const fullResolution = renderer.getDrawingBufferSize(new THREE.Vector2());
      uniforms.uResolution.value.set(64, 36);
      uniforms.uTravel.value = 18;
      renderer.setRenderTarget(probeTarget);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(probeTarget, 0, 0, 64, 36, probePixels);
      renderer.setRenderTarget(null);
      probeTarget.dispose();
      uniforms.uResolution.value.copy(fullResolution);
      uniforms.uTravel.value = 0;
      const hasLightGeometry = probePixels.some((value, index) => index % 4 !== 3 && value > 6);
      if (!hasLightGeometry) {
        geometry.dispose();
        material.dispose();
        for (const item of world.geometries) item.dispose();
        for (const item of world.materials) item.dispose();
        bloomPass.dispose();
        filmPass.dispose();
        outputPass.dispose();
        composer.dispose();
        renderer.dispose();
        window.setTimeout(() => setFallback(true), 0);
        return;
      }
    }

    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", onContextLost);
    renderer.setAnimationLoop(animate);

    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.remove(tunnel);
      geometry.dispose();
      material.dispose();
      for (const item of world.geometries) item.dispose();
      for (const item of world.materials) item.dispose();
      bloomPass.dispose();
      filmPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [fallback, finish, runId]);

  useEffect(() => () => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  }, []);

  if (fallback) return <HyperspaceIntro2D />;

  return (
    <div
      className={`space-experience${jumping ? " is-jumping" : " is-landed"}${exiting ? " is-exiting" : ""}`}
      aria-label={jumping ? "Three-dimensional hyperspace transit sequence" : "Three-dimensional Black Vector fleet theater"}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
