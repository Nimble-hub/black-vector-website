"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { HyperspaceIntro2D } from "./hyperspace-intro-2d";
import { HyperspaceAudio } from "./hyperspace-audio";

const DURATION = 16500;
const LAUNCH_PROGRESS = 0.35;
const DEPTH = 132;
const NEAR = 0.68;
const SCENE_EXPOSURE = 1.18;
const SCENE_RIM_BASE = 48;
const EXIT_RIM_BOOST = 86;
const SEEN_KEY = "black-vector-jump-seen-3d-v20";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

declare global {
  interface Window {
    __BV_CAPTURE_READY__?: boolean;
    __BV_CAPTURE_RENDER__?: (timeMs: number) => void;
  }
}

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
  uniform float uForwardStretch;
  uniform float uBackwardStretch;
  uniform float uWidthScale;
  uniform float uWarpTension;
  uniform float uWarpRelease;
  uniform float uWarpPhase;
  uniform float uWarpCruise;
  uniform vec2 uResolution;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;

  void main() {
    float travel = mod(aSeedZ + uTravel, uDepth);
    float normalizedDepth = travel / uDepth;
    float throatField = 1.0 - smoothstep(0.04, 0.52, normalizedDepth);
    float tensionCurve = uWarpTension * throatField;

    // The launch shell begins at the distant throat and expands toward the
    // camera, so the apparent lens is made from actual tunnel geometry rather
    // than a screen-space rectangle.
    float shellCenter = mix(0.035, 1.08, pow(clamp(uWarpPhase, 0.0, 1.0), 0.72));
    float shellDistance = (normalizedDepth - shellCenter) / 0.105;
    float shell = exp(-shellDistance * shellDistance);
    float shellSlope = -2.0 * shellDistance * shell;
    float cruiseWave = sin(normalizedDepth * 18.0 - uTravel * 0.11)
      * uWarpCruise
      * (0.012 + throatField * 0.012);
    float radialScale = 1.0
      + tensionCurve * 0.16
      + uWarpRelease * (shell * 0.22 + shellSlope * 0.055)
      + cruiseWave;

    float anchorZ = min(
      -uDepth + travel + uWarpRelease * shellSlope * 3.2,
      -uNear
    );
    float headZ = min(anchorZ + aLength * uForwardStretch, -uNear);
    float tailZ = anchorZ - aLength * uBackwardStretch;
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius * radialScale;

    vec4 clipTail = projectionMatrix * modelViewMatrix * vec4(radial, tailZ, 1.0);
    vec4 clipHead = projectionMatrix * modelViewMatrix * vec4(radial, headZ, 1.0);
    vec2 ndcTail = clipTail.xy / clipTail.w;
    vec2 ndcHead = clipHead.xy / clipHead.w;
    vec2 screenTail = ndcTail * uResolution * 0.5;
    vec2 screenHead = ndcHead * uResolution * 0.5;
    vec2 direction = normalize(screenHead - screenTail + vec2(0.00001));
    vec2 perpendicular = vec2(direction.y, -direction.x);
    float perspectiveWidth = clamp(22.0 / max(clipHead.w, 0.5), 0.8, 5.5);
    float halfWidth = max(aWidth * uWidthScale * perspectiveWidth, 1.65);

    float along = uv.y;
    vec2 screenPosition = mix(screenTail, screenHead, along);
    screenPosition += perpendicular * uv.x * halfWidth;
    vec2 ndcPosition = screenPosition / (uResolution * 0.5);
    float clipW = mix(clipTail.w, clipHead.w, along);
    float ndcZ = mix(clipTail.z / clipTail.w, clipHead.z / clipHead.w, along);

    gl_Position = vec4(ndcPosition * clipW, ndcZ * clipW, clipW);
    vRibbonUv = uv;
    vBrightness = aBrightness;
    vHue = aHue;
    vDepthFade = smoothstep(0.0, 24.0, travel);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;

  uniform float uOpacity;
  uniform float uEnergy;
  uniform float uSymmetry;

  void main() {
    float directionalTaper = mix(0.12, 1.0, smoothstep(0.0, 0.24, vRibbonUv.y));
    float centerDistance = abs(vRibbonUv.y - 0.5) * 2.0;
    float symmetricTaper = mix(1.0, 0.68, smoothstep(0.72, 1.0, centerDistance));
    float taper = mix(directionalTaper, symmetricTaper, uSymmetry);
    float side = abs(vRibbonUv.x) / max(taper, 0.001);
    float body = 1.0 - smoothstep(0.58, 0.96, side);
    float core = 1.0 - smoothstep(0.0, 0.22, side);
    float shoulder = (1.0 - smoothstep(0.28, 0.98, side)) * 0.16;
    float halo = (1.0 - smoothstep(0.52, 1.0, side)) * 0.085;
    float tailFade = smoothstep(0.0, 0.055, vRibbonUv.y);
    float headFade = 1.0 - smoothstep(0.975, 1.0, vRibbonUv.y);
    float directionalExposure = mix(0.3, 1.0, pow(vRibbonUv.y, 0.44));
    float directionalLongitudinal = tailFade * headFade * mix(0.24, 1.0, pow(vRibbonUv.y, 0.5));
    float symmetricLongitudinal = smoothstep(0.0, 0.045, vRibbonUv.y)
      * (1.0 - smoothstep(0.955, 1.0, vRibbonUv.y));
    float headExposure = mix(directionalExposure, 1.0, uSymmetry);
    float longitudinal = mix(directionalLongitudinal, symmetricLongitudinal, uSymmetry);

    vec3 coldBlue = vec3(0.34, 0.67, 1.0);
    vec3 photographicWhite = vec3(0.93, 0.985, 1.0);
    vec3 coreWhite = vec3(0.985, 0.998, 1.0);
    vec3 edgeColor = mix(coldBlue, photographicWhite, vHue);
    vec3 color = mix(edgeColor, coreWhite, core * 0.88)
      + coldBlue * halo * 0.18;
    float intensity = vBrightness * headExposure * (0.82 + core * 1.4) * uEnergy;
    float profile = min(body + shoulder + halo, 1.0);
    float alpha = profile * longitudinal * vDepthFade * uOpacity;

    gl_FragColor = vec4(color * intensity, alpha);
  }
`;

const tunnelDustVertexShader = `
  precision highp float;

  attribute float aAngle;
  attribute float aRadius;
  attribute float aSeedZ;
  attribute float aSize;
  attribute float aBrightness;

  uniform float uTravel;
  uniform float uDepth;
  uniform float uOpacity;
  uniform float uWarpTension;
  uniform float uWarpRelease;
  uniform float uWarpPhase;
  uniform float uWarpCruise;

  varying float vBrightness;
  varying float vLife;

  void main() {
    float travel = mod(aSeedZ + uTravel * 1.12, uDepth);
    float normalizedDepth = travel / uDepth;
    float throatField = 1.0 - smoothstep(0.04, 0.52, normalizedDepth);
    float shellCenter = mix(0.035, 1.08, pow(clamp(uWarpPhase, 0.0, 1.0), 0.72));
    float shellDistance = (normalizedDepth - shellCenter) / 0.105;
    float shell = exp(-shellDistance * shellDistance);
    float shellSlope = -2.0 * shellDistance * shell;
    float cruiseWave = sin(normalizedDepth * 18.0 - uTravel * 0.11)
      * uWarpCruise
      * (0.012 + throatField * 0.012);
    float radialScale = 1.0
      + uWarpTension * throatField * 0.16
      + uWarpRelease * (shell * 0.22 + shellSlope * 0.055)
      + cruiseWave;
    float z = -uDepth + travel + uWarpRelease * shellSlope * 3.2;
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius * radialScale;
    vec4 viewPosition = modelViewMatrix * vec4(radial, z, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * (18.0 / max(-viewPosition.z, 1.0)), 0.7, 4.2);

    vBrightness = aBrightness;
    vLife = smoothstep(0.0, 12.0, travel)
      * (1.0 - smoothstep(uDepth - 5.0, uDepth, travel));
    vLife *= uOpacity;
  }
`;

const tunnelDustFragmentShader = `
  precision highp float;

  varying float vBrightness;
  varying float vLife;

  void main() {
    float distanceFromCenter = length(gl_PointCoord - 0.5);
    float speck = 1.0 - smoothstep(0.18, 0.5, distanceFromCenter);
    float core = 1.0 - smoothstep(0.0, 0.15, distanceFromCenter);
    vec3 ice = mix(vec3(0.34, 0.7, 1.0), vec3(0.97, 0.995, 1.0), core);
    float alpha = speck * vLife * vBrightness;
    gl_FragColor = vec4(ice * (0.62 + core * 0.72), alpha);
  }
`;

const warpBubbleVertexShader = `
  precision highp float;

  attribute float aLayer;

  uniform float uTime;
  uniform float uTravel;
  uniform float uCompression;
  uniform float uRelease;
  uniform float uCruise;

  varying vec4 vFieldData;
  varying vec3 vEnergyData;

  void main() {
    float angle = atan(position.y, position.x);
    float depth = uv.y;
    float layerPhase = aLayer * 2.0943951;
    float axialFlow = depth * 7.2 - uTravel * 0.052;
    float broadWarp = sin(
      axialFlow + angle * 1.7 + sin(angle * 2.0 - axialFlow * 0.38) * 1.2
        + layerPhase
    );
    float counterFlow = sin(
      axialFlow * 0.58 - angle * 2.8 + uTime * 0.24
        + sin(axialFlow * 0.44 + angle * 3.0) * 0.9
        - layerPhase
    );
    float fineFold = sin(
      axialFlow * 1.9 + angle * 4.2 - uTime * 0.31 + layerPhase
    );
    float compression = smoothstep(0.08, 0.96, 0.5 + 0.5 * broadWarp);
    float displacement = broadWarp * 0.52
      + counterFlow * (0.18 + uCruise * 0.08)
      + fineFold * (0.055 + compression * 0.065);
    vec2 radial = normalize(position.xy);
    float radialOffset = aLayer * 0.92;
    float twist = (
      sin(axialFlow * 0.46 + angle * 2.0 + layerPhase) * 0.012
        + counterFlow * 0.006
    ) * uCruise;
    float twistCos = cos(twist);
    float twistSin = sin(twist);
    vec3 displacedPosition = position;
    float axialEnvelope = pow(max(sin(depth * 3.14159265), 0.0), 0.24);
    float bubbleScale = mix(0.82, 1.0, axialEnvelope);
    bubbleScale *= 1.0 - uCompression * 0.035 + uRelease * 0.055;
    displacedPosition.xy *= bubbleScale;
    displacedPosition.xy += radial * (
      radialOffset + displacement * (0.42 + uCruise * 0.34)
    );
    displacedPosition.xy = mat2(twistCos, -twistSin, twistSin, twistCos) * displacedPosition.xy;
    displacedPosition.z += counterFlow * compression * uCruise * 0.22;

    vec4 viewPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vec3 viewDirection = normalize(-viewPosition.xyz);
    float fresnel = pow(1.0 - abs(dot(viewNormal, viewDirection)), 1.12);
    vFieldData = vec4(uv, aLayer, fresnel);
    vEnergyData = vec3(compression, abs(displacement), axialEnvelope);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const warpBubbleFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uTravel;
  uniform float uCompression;
  uniform float uRelease;
  uniform float uCruise;
  uniform float uImpact;

  varying vec4 vFieldData;
  varying vec3 vEnergyData;

  void main() {
    float angle = vFieldData.x * 6.2831853;
    float depth = vFieldData.y;
    float layer = vFieldData.z;
    float fresnel = vFieldData.w;
    float compression = vEnergyData.x;
    float distortion = vEnergyData.y;
    float axialEnvelope = vEnergyData.z;
    float layerPhase = layer * 2.0943951;
    float axialFlow = depth * 8.2 - uTravel * (0.042 + uCruise * 0.018);

    float domainA = sin(
      angle * 1.65 + axialFlow
        + sin(angle * 2.4 - axialFlow * 0.43 + uTime * 0.12) * 1.35
        + layerPhase
    );
    float domainB = sin(
      angle * 2.85 - axialFlow * 0.64
        + sin(angle * 1.8 + axialFlow * 0.36 - uTime * 0.08) * 1.05
        - layerPhase
    );
    float domainC = sin(
      angle * 4.6 + axialFlow * 1.42 - uTime * 0.19
        + domainA * 0.72
    );

    float broadField = clamp(
      0.5 + domainA * 0.27 + domainB * 0.18 + domainC * 0.08,
      0.0,
      1.0
    );
    float softSheet = smoothstep(0.26, 0.79, broadField);
    float foldedField = 0.5 + 0.5 * sin(
      axialFlow * 1.28 + angle * 3.15 + domainA * 1.55 - domainB * 0.72
    );
    float ridge = smoothstep(0.66, 0.94, foldedField)
      * smoothstep(0.2, 0.82, softSheet);
    float counterEddy = 0.5 + 0.5 * sin(
      angle * 2.2 - axialFlow * 0.46 + domainB * 1.2 + uTime * 0.11
    );
    float eddySheet = smoothstep(0.48, 0.9, counterEddy) * softSheet;
    float rim = pow(clamp(fresnel, 0.0, 1.0), 0.78);

    // A slower, broader current gives the shell real depth behind the fast
    // tunnel traces. It reads as refracted space instead of a drawn pattern.
    float slowFlow = depth * 4.35 - uTravel * (0.018 + uCruise * 0.009);
    float slowDomain = 0.5 + 0.5 * sin(
      slowFlow + angle * 1.28 + domainB * 0.82 - uTime * 0.055 + layerPhase
    );
    float deepVeil = smoothstep(0.24, 0.86, slowDomain)
      * smoothstep(0.08, 0.7, softSheet + rim * 0.18);
    float passage = pow(max(0.0, sin(
      depth * 6.2831853 - uTravel * 0.026 + angle * 0.34 - layerPhase
    )), 4.0) * uCruise;

    float glintCarrier = max(0.0, sin(
      angle * 8.0 + axialFlow * 2.7 + domainC * 1.4 + layerPhase
    ));
    float glintGate = max(0.0, sin(
      angle * 3.0 - axialFlow * 3.8 - layerPhase
    ));
    float glint = pow(glintCarrier, 12.0) * pow(glintGate, 8.0)
      * ridge * (0.3 + rim * 0.7);

    float shellEnergy = softSheet * 0.13
      + eddySheet * 0.075
      + deepVeil * 0.055
      + ridge * (0.15 + distortion * 0.04)
      + rim * (0.065 + softSheet * 0.12)
      + glint * 0.92
      + passage * (0.018 + rim * 0.032)
      + uImpact * (0.026 + rim * 0.045) * (0.35 + softSheet * 0.65);
    float depthFade = smoothstep(0.018, 0.12, depth)
      * (1.0 - smoothstep(0.88, 0.995, depth));
    float layerWeight = mix(0.46, 0.92, 1.0 - abs(layer));
    float launchEnvelope = 0.34 + uCruise * 0.66 + uRelease * 0.18;
    float alpha = shellEnergy
      * layerWeight
      * depthFade
      * axialEnvelope
      * launchEnvelope
      * uOpacity;

    vec3 deepBubbleBlue = vec3(0.008, 0.035, 0.12);
    vec3 ionBlue = vec3(0.035, 0.24, 0.62);
    vec3 rimCyan = vec3(0.32, 0.76, 1.0);
    vec3 photographicWhite = vec3(0.92, 0.985, 1.0);
    vec3 warmRefraction = vec3(0.64, 0.44, 0.3);
    vec3 spectralViolet = vec3(0.34, 0.16, 0.82);
    vec3 bodyColor = mix(deepBubbleBlue, ionBlue, softSheet * 0.68 + ridge * 0.2);
    vec3 color = mix(bodyColor, rimCyan, clamp(rim * 0.5 + ridge * 0.32, 0.0, 1.0));
    color = mix(color, warmRefraction, ridge * counterEddy * 0.055);
    color = mix(color, spectralViolet, glint * (0.045 + (1.0 - counterEddy) * 0.055));
    color = mix(color, photographicWhite, glint);
    float pressureLift = 1.0
      + uCompression * 0.08
      + uRelease * 0.16
      + uImpact * 0.3;
    float highlightRolloff = 0.86 + glint * 1.8 + passage * rim * 0.24;
    gl_FragColor = vec4(color * pressureLift * highlightRolloff, alpha);
  }
`;

const gravitationalLensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uRadius: { value: 0.06 },
    uStretch: { value: 0 },
    uDarkness: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uCruise: { value: 0 },
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
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uStretch;
    uniform float uDarkness;
    uniform float uFlash;
    uniform float uTime;
    uniform float uCruise;

    varying vec2 vUv;

    float sceneLuma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 centered = vUv - uCenter;
      centered.x *= aspect;
      float radius = length(centered);
      vec2 radial = centered / max(radius, 0.0001);
      vec2 radialUv = vec2(radial.x / aspect, radial.y);
      vec2 tangentUv = vec2(-radial.y / aspect, radial.x);
      float horizon = max(uRadius, 0.025);
      float angle = atan(centered.y, centered.x);
      float broadFlow = sin(angle * 2.0 - uTime * 0.34)
        + sin(angle * 3.0 + uTime * 0.21) * 0.46;
      float fineFlow = sin(angle * 7.0 - uTime * 0.72) * 0.024
        + sin(angle * 13.0 + uTime * 0.41) * 0.011;
      float ringUndulation = fineFlow + broadFlow * uCruise * 0.018;
      float shapedHorizon = horizon * (1.0 + ringUndulation * uStrength);
      float signedDistance = radius - shapedHorizon;
      float ringWidth = max(horizon * 0.26, 0.018);
      float photonRing = exp(-pow(signedDistance / ringWidth, 2.0) * 2.6);
      float innerDistance = signedDistance + ringWidth * 0.78;
      float outerDistance = signedDistance - ringWidth * 1.18;
      float innerSkin = exp(-pow(innerDistance / (ringWidth * 0.72), 2.0) * 2.1);
      float outerSkin = exp(-pow(outerDistance / (ringWidth * 1.16), 2.0) * 1.85);
      float shellStack = photonRing + innerSkin * 0.48 + outerSkin * 0.34;
      float outerField = 1.0 - smoothstep(horizon * 1.05, horizon * 4.4, radius);
      float innerGuard = smoothstep(horizon * 0.34, horizon * 0.86, radius);
      float falloff = (horizon * horizon) /
        max(radius * radius + horizon * horizon * 0.3, 0.0001);
      float shellFold = (-signedDistance / max(ringWidth, 0.001)) * photonRing
        + (-innerDistance / max(ringWidth, 0.001)) * innerSkin * 0.42
        + (-outerDistance / max(ringWidth, 0.001)) * outerSkin * 0.28;
      float deflection = uStrength * outerField * innerGuard * falloff * 0.049
        + shellFold * uStrength * (0.0069 + uCruise * 0.0037)
        + uFlash * outerField * innerGuard * falloff * 0.018;
      vec2 uvMin = vec2(0.001);
      vec2 uvMax = vec2(0.999);
      float orbitalShear = (
        sin(angle * 3.0 + uTime * 0.34)
          + sin(angle * 5.0 - uTime * 0.19) * 0.38
      ) * shellStack * uStrength * (0.00055 + uCruise * 0.0007);
      vec2 warpedUv = clamp(
        vUv + radialUv * deflection + tangentUv * orbitalShear,
        uvMin,
        uvMax
      );

      vec2 skinSeparation = radialUv
        * shellStack
        * uStrength
        * (0.0018 + uCruise * 0.0016);

      float stretchMask = outerField * smoothstep(horizon * 0.55, horizon * 2.8, radius);
      vec2 stretchOffset = radialUv * uStretch * (0.35 + photonRing * 0.65);
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 warped = texture2D(tDiffuse, warpedUv).rgb;
      vec3 skinInner = texture2D(tDiffuse, clamp(warpedUv + skinSeparation, uvMin, uvMax)).rgb;
      vec3 skinOuter = texture2D(tDiffuse, clamp(warpedUv - skinSeparation * 1.35, uvMin, uvMax)).rgb;
      float skinBlend = clamp(shellStack * (0.14 + uCruise * 0.22), 0.0, 0.48);
      warped = mix(warped, skinInner * 0.62 + skinOuter * 0.38, skinBlend);
      vec3 streak = warped * 0.34;
      streak += texture2D(tDiffuse, clamp(warpedUv + stretchOffset * 0.3, uvMin, uvMax)).rgb * 0.24;
      streak += texture2D(tDiffuse, clamp(warpedUv + stretchOffset * 0.65, uvMin, uvMax)).rgb * 0.19;
      streak += texture2D(tDiffuse, clamp(warpedUv + stretchOffset, uvMin, uvMax)).rgb * 0.13;
      streak += texture2D(tDiffuse, clamp(warpedUv - stretchOffset * 0.22, uvMin, uvMax)).rgb * 0.1;
      float stretchBlend = clamp(uStretch * 16.0, 0.0, 0.88) * stretchMask;
      vec3 lensed = mix(warped, streak, stretchBlend);

      float chroma = (shellStack * uStrength * 0.00125 + uStretch * 0.0021) * outerField;
      lensed.r = texture2D(tDiffuse, clamp(warpedUv - radialUv * chroma, uvMin, uvMax)).r;
      lensed.b = texture2D(tDiffuse, clamp(warpedUv + radialUv * chroma, uvMin, uvMax)).b;
      float compressedLight = max(sceneLuma(lensed) - sceneLuma(base), 0.0);
      float horizontalFlare = exp(-abs(centered.y) / (0.004 + uFlash * 0.004))
        * exp(-radius * 4.6) * uFlash;
      vec3 ringLight = vec3(0.68, 0.88, 1.0)
        * (photonRing + innerSkin * 0.22 + outerSkin * 0.14)
        * (0.024 + compressedLight * 0.42) * uStrength;
      vec3 launchLight = vec3(0.74, 0.9, 1.0)
        * (photonRing * 0.12 + horizontalFlare * 0.075) * uFlash;
      float core = (1.0 - smoothstep(horizon * 0.28, horizon * 0.86, radius))
        * uDarkness;
      vec3 color = mix(base, lensed, outerField);
      color += ringLight + launchLight;
      color *= 1.0 - core * 0.9;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

const exitWakeVertexShader = `
  precision highp float;

  attribute float aAngle;
  attribute float aRadius;
  attribute float aSeed;
  attribute float aLength;
  attribute float aWidth;
  attribute float aBrightness;
  attribute float aDrift;

  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uResolution;

  varying vec2 vShardUv;
  varying float vBrightness;
  varying float vLife;

  vec3 wakePosition(float age) {
    float directionSign = mix(-1.0, 1.0, step(0.5, fract(aSeed * 19.73)));
    float dragRate = 0.52 + aDrift * 0.86;
    float retainedTravel = (1.0 - exp(-age * dragRate)) / dragRate;
    float turbulenceOnset = smoothstep(0.18, 0.9, age);
    float turn = aAngle
      + directionSign * age * (0.045 + aDrift * 0.07)
      + sin(age * (0.74 + aDrift * 0.5) + aSeed * 15.0) * 0.09 * turbulenceOnset;
    vec2 radialDirection = normalize(vec2(cos(turn), sin(turn) * 0.72));
    vec2 ellipseDirection = vec2(cos(turn), sin(turn) * 0.72);
    vec2 tangentDirection = normalize(vec2(-sin(turn), cos(turn) * 0.72));
    float radius = aRadius * (1.0 + age * (0.012 + aDrift * 0.022));
    float gustPulse = 0.35 + 0.65 * (
      0.5 + 0.5 * sin(age * (1.08 + aDrift * 0.72) + aSeed * 23.0)
    );
    vec2 gust = (
      tangentDirection * sin(age * (1.7 + aDrift) + aSeed * 29.0) * (0.2 + age * 0.1)
      + radialDirection * cos(age * (1.15 + aDrift * 0.8) + aSeed * 17.0) * 0.11
    ) * turbulenceOnset * gustPulse * (0.36 + aDrift * 0.68);
    float forwardTravel = -(7.2 + aLength * 1.65) * retainedTravel;
    float depthTurbulence = sin(age * (1.5 + aDrift) + aSeed * 21.0)
      * 0.1 * turbulenceOnset;
    return vec3(ellipseDirection * radius + gust, 1.4 + aSeed * 5.2 + forwardTravel + depthTurbulence);
  }

  void main() {
    float delay = 0.02
      + (0.5 + 0.5 * sin(aAngle * 2.0 + 0.8)) * 0.1
      + aSeed * 0.08;
    float age = max(uTime - delay, 0.0);
    float lifetime = 3.7 + aDrift * 1.55;
    float life = clamp(age / lifetime, 0.0, 1.0);
    float isAlive = step(delay, uTime) * (1.0 - step(lifetime, age));
    float trailDuration = 0.13 + aLength * 0.035;
    vec3 headPosition = wakePosition(age);
    vec3 tailPosition = wakePosition(max(age - trailDuration, 0.0));
    vec4 headClip = projectionMatrix * vec4(headPosition, 1.0);
    vec4 tailClip = projectionMatrix * vec4(tailPosition, 1.0);
    vec2 headNdc = headClip.xy / max(headClip.w, 0.001);
    vec2 tailNdc = tailClip.xy / max(tailClip.w, 0.001);
    vec2 line = headNdc - tailNdc;
    vec2 linePixels = line * uResolution * 0.5;
    vec2 perpendicular = normalize(vec2(-linePixels.y, linePixels.x) + vec2(0.0001));
    float widthPixels = 0.65 + aWidth * 1.45;
    vec2 centerNdc = mix(tailNdc, headNdc, uv.y);
    vec2 offsetNdc = perpendicular * uv.x * widthPixels * 2.0 / uResolution;
    gl_Position = vec4(centerNdc + offsetNdc, mix(tailClip.z / tailClip.w, headClip.z / headClip.w, uv.y), 1.0);
    vShardUv = uv;
    vBrightness = aBrightness;
    vLife = isAlive
      * smoothstep(0.3, 1.15, -headPosition.z)
      * smoothstep(0.08, 0.72, -tailPosition.z)
      * smoothstep(0.0, 0.055, life)
      * (1.0 - smoothstep(0.7, 1.0, life))
      * uOpacity;
  }
`;

const exitWakeFragmentShader = `
  precision highp float;

  varying vec2 vShardUv;
  varying float vBrightness;
  varying float vLife;

  void main() {
    float widthProfile = pow(max(sin(vShardUv.y * 3.14159265), 0.0), 0.62);
    float side = abs(vShardUv.x) / max(widthProfile, 0.001);
    float softBody = 1.0 - smoothstep(0.18, 0.96, side);
    float fiber = 1.0 - smoothstep(0.035, 0.28, abs(vShardUv.x));
    float tail = smoothstep(0.0, 0.14, vShardUv.y);
    float head = 1.0 - smoothstep(0.86, 1.0, vShardUv.y);
    float alpha = max(softBody * 0.44, fiber * 0.66) * tail * head * vLife * vBrightness;
    vec3 color = mix(vec3(0.34, 0.62, 0.86), vec3(0.88, 0.96, 1.0), fiber * 0.55);
    gl_FragColor = vec4(color * 0.92, alpha);
  }
`;

const exitCrystalVertexShader = `
  precision highp float;

  attribute vec3 aVelocity;
  attribute float aDelay;
  attribute float aLifetime;
  attribute float aSize;
  attribute float aBrightness;
  attribute float aTurbulence;
  attribute float aSeed;
  attribute vec3 aClusterOrigin;
  attribute vec3 aClusterVelocity;
  attribute float aSwirl;
  attribute float aClusterPhase;

  uniform float uTime;
  uniform float uOpacity;

  varying float vLife;
  varying float vBrightness;
  varying float vCoolness;
  varying float vRotation;

  void main() {
    float age = max(uTime - aDelay, 0.0);
    float life = clamp(age / aLifetime, 0.0, 1.0);
    float isAlive = step(aDelay, uTime) * (1.0 - step(aLifetime, age));
    float fade = smoothstep(0.0, 0.055, life) * (1.0 - smoothstep(0.68, 1.0, life));

    vec3 localOffset = position - aClusterOrigin;
    float roll = age * aSwirl * 1.14 + sin(age * 1.45 + aClusterPhase) * 0.34;
    float rollCos = cos(roll);
    float rollSin = sin(roll);
    localOffset.xy = mat2(rollCos, -rollSin, rollSin, rollCos) * localOffset.xy;
    localOffset *= 1.0 + age * 0.16;

    float orbit = age * aSwirl * 0.58 + sin(age * 1.18 + aClusterPhase) * 0.22;
    float orbitCos = cos(orbit);
    float orbitSin = sin(orbit);
    vec2 clusterOrbit = mat2(orbitCos, -orbitSin, orbitSin, orbitCos) * aClusterOrigin.xy;
    clusterOrbit *= 1.0 + age * (0.08 + aSeed * 0.045);
    vec2 radialDirection = normalize(clusterOrbit + vec2(0.0001));
    vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);
    float curl = sin(age * 3.85 + aClusterPhase + aSeed * 1.7);
    float eddy = cos(age * 2.45 + aClusterPhase * 1.31 + aSeed * 2.4);
    float windStrength = aTurbulence * smoothstep(0.0, 0.14, age) * (0.62 + age * 0.3);
    vec3 windRoll = vec3(
      tangentDirection * (curl * 0.72 + sin(age * 1.3 + aClusterPhase) * age * 0.28)
        + radialDirection * eddy * 0.34,
      curl * eddy * 0.3
    ) * windStrength;

    vec3 clusterPosition = vec3(clusterOrbit, aClusterOrigin.z)
      + aClusterVelocity * age * 0.3;
    vec3 particlePosition = clusterPosition + localOffset + aVelocity * age + windRoll;
    vec4 viewPosition = vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float facetShimmer = 0.92 + sin(age * (4.0 + aSeed * 3.0) + aSeed * 31.0) * 0.08;
    gl_PointSize = clamp(aSize * facetShimmer * (20.0 / max(-viewPosition.z, 1.0)), 1.0, 20.0);

    vLife = isAlive * fade * uOpacity;
    vBrightness = aBrightness;
    vCoolness = aSeed;
    vRotation = aSeed + age * abs(aSwirl) * 0.055;
  }
`;

const exitCrystalFragmentShader = `
  precision highp float;

  varying float vLife;
  varying float vBrightness;
  varying float vCoolness;
  varying float vRotation;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float rotation = vRotation * 6.2831853;
    point = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation)) * point;
    float diamondDistance = abs(point.x) + abs(point.y);
    float body = 1.0 - smoothstep(0.32, 0.5, diamondDistance);
    float innerFacet = 1.0 - smoothstep(0.08, 0.3, diamondDistance);
    float verticalGlint = 1.0 - smoothstep(0.018, 0.085, abs(point.x));
    float horizontalGlint = 1.0 - smoothstep(0.018, 0.085, abs(point.y));
    float glint = max(verticalGlint, horizontalGlint) * (1.0 - smoothstep(0.22, 0.5, diamondDistance));
    float facet = max(innerFacet * 0.62, glint);

    vec3 iceBlue = vec3(0.28, 0.72, 1.0);
    vec3 frostWhite = vec3(0.94, 0.99, 1.0);
    vec3 color = mix(iceBlue, frostWhite, 0.55 + vCoolness * 0.35 + facet * 0.3);
    float alpha = body * vLife * vBrightness * (0.72 + facet * 0.28);
    gl_FragColor = vec4(color * (0.74 + facet * 1.65), alpha);
  }
`;

const exitDustVertexShader = `
  precision highp float;

  attribute vec3 aVelocity;
  attribute float aDelay;
  attribute float aLifetime;
  attribute float aSize;
  attribute float aBrightness;
  attribute float aTurbulence;
  attribute float aSeed;
  attribute float aDrag;
  attribute float aGlint;
  attribute vec3 aClusterOrigin;
  attribute float aSwirl;
  attribute float aClusterPhase;

  uniform float uTime;
  uniform float uOpacity;

  varying float vLife;
  varying float vBrightness;
  varying float vGlint;
  varying float vFacetRotation;
  varying float vFacetFlash;

  void main() {
    float age = max(uTime - aDelay, 0.0);
    float life = clamp(age / aLifetime, 0.0, 1.0);
    float isAlive = step(aDelay, uTime) * (1.0 - step(aLifetime, age));
    float fade = smoothstep(0.0, 0.045, life) * (1.0 - smoothstep(0.7, 1.0, life));

    vec3 localOffset = position - aClusterOrigin;
    float turbulenceOnset = smoothstep(0.14, 0.94, age);
    float spin = age * aSwirl * 0.34
      + sin(age * 0.76 + aClusterPhase) * 0.11 * turbulenceOnset;
    float spinCos = cos(spin);
    float spinSin = sin(spin);
    localOffset.xy = mat2(spinCos, -spinSin, spinSin, spinCos) * localOffset.xy;
    localOffset.xy *= 1.0 + age * (0.025 + aTurbulence * 0.018);
    localOffset.z *= 1.0 + age * 0.08;

    float clusterTurn = age * aSwirl * 0.065
      + sin(age * 0.68 + aClusterPhase) * turbulenceOnset * 0.075
      + sin(age * 1.62 + aClusterPhase * 1.37) * turbulenceOnset * 0.022;
    float turnCos = cos(clusterTurn);
    float turnSin = sin(clusterTurn);
    vec2 clusterOrbit = mat2(turnCos, -turnSin, turnSin, turnCos) * aClusterOrigin.xy;
    float shockRise = smoothstep(0.04, 0.52, age);
    float shockTravel = (1.0 - exp(-age * (2.1 + aDrag * 0.5)))
      * (1.28 + aTurbulence * 1.58);
    clusterOrbit *= 1.0
      + shockRise * (0.18 + aTurbulence * 0.1)
      + age * (0.035 + aTurbulence * 0.018);
    vec2 radialDirection = normalize(clusterOrbit + vec2(0.0001));
    vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);

    float gustPulse = 0.32 + 0.68 * (
      0.5 + 0.5 * sin(age * 1.12 + aClusterPhase * 2.1)
    );
    float gustStrength = aTurbulence * turbulenceOnset * gustPulse * (0.2 + age * 0.12);
    float sharedCurl = sin(age * 1.72 + aClusterPhase);
    float sharedRoll = cos(age * 1.06 + aClusterPhase * 1.27);
    float microCurl = sin(age * (2.1 + aSeed * 0.8) + aSeed * 18.0) * 0.18;
    vec3 gust = vec3(
      tangentDirection * ((sharedCurl + microCurl) * 0.72 + sin(age * 0.63 + aClusterPhase) * age * 0.1)
        + radialDirection * sharedRoll * 0.26,
      (sharedCurl * sharedRoll + microCurl) * 0.16
    ) * gustStrength;

    float dragRate = aDrag;
    float retainedTravel = (1.0 - exp(-age * dragRate)) / dragRate;
    float forwardSpeed = 3.8 + aVelocity.z * 6.8;
    float forwardInertia = -forwardSpeed * retainedTravel;
    vec3 particlePosition = vec3(clusterOrbit, aClusterOrigin.z)
      + localOffset
      + vec3(radialDirection * shockTravel, 0.0)
      + vec3(aVelocity.xy * retainedTravel * 0.18, forwardInertia)
      + gust;
    vec4 viewPosition = vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float forwardDepth = max(-viewPosition.z, 0.0);
    float headlightProximity = 1.0 - smoothstep(3.0, 30.0, forwardDepth);
    float headlightCone = 1.0 - smoothstep(
      0.32,
      1.58,
      length(viewPosition.xy) / max(forwardDepth, 1.0)
    );
    float headlightResponse = headlightProximity
      * headlightCone
      * step(0.18, forwardDepth);
    float facetFlash = pow(
      max(sin(age * (3.15 + aSeed * 2.55) + aSeed * 43.0), 0.0),
      19.0
    ) * step(0.48, aSeed);
    float seededFlash = aGlint * pow(
      max(sin(age * (1.55 + aSeed * 1.3) + aSeed * 67.0), 0.0),
      22.0
    );
    float diamondFire = max(facetFlash, seededFlash);
    float effectiveGlint = max(diamondFire, headlightResponse * 0.42);
    gl_PointSize = clamp(
      aSize * (18.0 / max(-viewPosition.z, 1.0))
        * (1.0 + diamondFire * 2.5 + headlightResponse * 0.16),
      0.58,
      6.4
    );

    vLife = isAlive * fade * uOpacity;
    vBrightness = aBrightness * (
      0.78 + headlightResponse * 2.8 + diamondFire * 3.25
    );
    vGlint = effectiveGlint;
    vFacetRotation = aSeed * 6.2831853 + age * (0.32 + aTurbulence * 0.23);
    vFacetFlash = diamondFire;
  }
`;

const exitDustFragmentShader = `
  precision highp float;

  varying float vLife;
  varying float vBrightness;
  varying float vGlint;
  varying float vFacetRotation;
  varying float vFacetFlash;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float rotationCos = cos(vFacetRotation);
    float rotationSin = sin(vFacetRotation);
    point = mat2(rotationCos, -rotationSin, rotationSin, rotationCos) * point;

    float diamondDistance = abs(point.x) + abs(point.y);
    float crystalBody = 1.0 - smoothstep(0.455, 0.5, diamondDistance);
    float innerDiamond = 1.0 - smoothstep(0.05, 0.33, diamondDistance);
    float facetAxis = abs(point.x) - abs(point.y);
    float facetLight = clamp(0.5 + facetAxis * 2.8, 0.0, 1.0);
    float facetSeam = 1.0 - smoothstep(0.008, 0.035, abs(facetAxis));
    float crystalEdge = smoothstep(0.28, 0.47, diamondDistance) * crystalBody;

    float horizontalGlint = 1.0 - smoothstep(0.01, 0.06, abs(point.y));
    float verticalGlint = 1.0 - smoothstep(0.01, 0.06, abs(point.x));
    float glintFalloff = 1.0 - smoothstep(0.06, 0.49, diamondDistance);
    float diffraction = max(horizontalGlint, verticalGlint * 0.72)
      * glintFalloff * max(vGlint, vFacetFlash);
    float pinFire = 1.0 - smoothstep(0.0, 0.075, diamondDistance);

    vec3 iceShadow = vec3(0.62, 0.78, 0.9);
    vec3 iceFacet = vec3(0.88, 0.965, 1.0);
    vec3 reflectedWhite = vec3(0.985, 0.998, 1.0);
    vec3 color = mix(iceShadow, iceFacet, 0.66 + facetLight * 0.3);
    color = mix(color, reflectedWhite, innerDiamond * 0.58 + facetSeam * 0.24);

    float bodyAlpha = crystalBody * (0.13 + innerDiamond * 0.1)
      * (1.0 - vFacetFlash * 0.84);
    float sparkleAlpha = max(diffraction * 1.08, pinFire * vFacetFlash * 0.88);
    float alpha = max(
      bodyAlpha,
      sparkleAlpha
    ) * vLife * vBrightness;
    vec3 spectralIce = mix(
      vec3(0.58, 0.88, 1.0),
      vec3(1.0, 0.91, 0.76),
      smoothstep(-0.32, 0.32, point.x)
    );
    vec3 flashColor = mix(reflectedWhite, spectralIce, vFacetFlash * 0.12);
    vec3 emittedLight = flashColor * (
      pinFire * (1.6 + vFacetFlash * 8.6)
        + diffraction * 5.0
        + crystalEdge * vGlint * 0.42
    );
    gl_FragColor = vec4(color * (1.12 + facetLight * 0.52) + emittedLight, alpha);
  }
`;

const environmentStarVertexShader = `
  precision highp float;

  attribute float aSize;
  attribute float aIntensity;
  attribute float aPhase;
  attribute float aGlint;

  uniform float uTime;
  uniform float uOpacity;

  varying vec3 vStarColor;
  varying float vStarAlpha;
  varying float vGlint;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float twinkleAmount = mix(0.014, 0.065, aGlint);
    float twinkle = 1.0 - twinkleAmount
      + sin(uTime * (0.42 + aPhase * 0.28) + aPhase * 31.0) * twinkleAmount;
    float glintPulse = 0.88 + sin(uTime * 0.68 + aPhase * 47.0) * 0.12;
    gl_PointSize = clamp(
      aSize * (260.0 / max(-viewPosition.z, 1.0)) * mix(1.0, glintPulse, aGlint),
      0.65,
      7.5
    );
    vStarColor = color;
    vStarAlpha = aIntensity * twinkle * uOpacity;
    vGlint = aGlint;
  }
`;

const environmentStarFragmentShader = `
  precision highp float;

  varying vec3 vStarColor;
  varying float vStarAlpha;
  varying float vGlint;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    float core = 1.0 - smoothstep(0.025, 0.14, radius);
    float halo = 1.0 - smoothstep(0.08, 0.5, radius);
    float horizontalRay = 1.0 - smoothstep(0.008, 0.026, abs(point.y));
    float verticalRay = 1.0 - smoothstep(0.008, 0.026, abs(point.x));
    float rayFalloff = 1.0 - smoothstep(0.08, 0.49, radius);
    float diffraction = max(horizontalRay, verticalRay * 0.55) * rayFalloff * vGlint;
    float haloWeight = mix(0.12, 0.27, vGlint);
    float alpha = max(core, halo * haloWeight + diffraction * 0.72) * vStarAlpha;
    vec3 whiteCore = vec3(0.985, 0.997, 1.0);
    vec3 color = mix(vStarColor, whiteCore, core * 0.62 + diffraction * 0.32);
    gl_FragColor = vec4(color * (0.72 + core * 1.65 + diffraction * 1.28), alpha);
  }
`;

const stellarVeilVertexShader = `
  precision highp float;

  attribute float aSize;
  attribute float aIntensity;
  attribute float aPhase;

  uniform float uTime;
  uniform float uOpacity;

  varying vec3 vVeilColor;
  varying float vVeilAlpha;
  varying float vPhase;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float breathe = 0.97 + sin(uTime * 0.055 + aPhase * 6.2831853) * 0.03;
    gl_PointSize = clamp(aSize * breathe * (260.0 / max(-viewPosition.z, 1.0)), 4.0, 38.0);
    vVeilColor = color;
    vVeilAlpha = aIntensity * uOpacity;
    vPhase = aPhase;
  }
`;

const stellarVeilFragmentShader = `
  precision highp float;

  varying vec3 vVeilColor;
  varying float vVeilAlpha;
  varying float vPhase;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float angle = atan(point.y, point.x);
    float warp = sin(angle * 3.0 + vPhase * 9.0) * 0.032
      + sin(angle * 7.0 - vPhase * 13.0) * 0.014;
    float radius = length(point) + warp;
    float cloud = 1.0 - smoothstep(0.08, 0.5, radius);
    float filament = 0.72 + 0.28 * sin(
      point.x * 14.0 + point.y * 9.0 + vPhase * 17.0
    );
    float alpha = cloud * cloud * filament * vVeilAlpha;
    vec3 silver = vec3(0.72, 0.84, 0.94);
    vec3 color = mix(vVeilColor, silver, cloud * 0.16);
    gl_FragColor = vec4(color * (0.58 + filament * 0.34), alpha);
  }
`;

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
    const light = 0.46 + Math.random() * 0.4;
    angles[index] = Math.random() * Math.PI * 2;
    radii[index] = 13.5 + Math.pow(Math.random(), 0.82) * 9;
    seeds[index] = Math.random() * (DEPTH - 10);
    lengths[index] = 4.8 + Math.pow(Math.random(), 0.6) * 10.5;
    widths[index] = 0.52 + light * (0.48 + Math.random() * 0.3);
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

function createTunnelDustGeometry(count: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const angles = new Float32Array(count);
  const radii = new Float32Array(count);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    angles[index] = Math.random() * Math.PI * 2;
    radii[index] = 2.5 + Math.pow(Math.random(), 0.72) * 9.7;
    seeds[index] = Math.random() * DEPTH;
    sizes[index] = 1.05 + Math.pow(Math.random(), 1.8) * 2.35;
    brightness[index] = 0.32 + Math.random() * 0.68;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute("aSeedZ", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
  return geometry;
}

function createWarpBubbleGeometry(isMobile: boolean) {
  const baseGeometry = new THREE.CylinderGeometry(
    19.6,
    19.6,
    DEPTH,
    isMobile ? 32 : 56,
    isMobile ? 36 : 64,
    true,
  );
  baseGeometry.rotateX(Math.PI / 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.copy(baseGeometry);
  baseGeometry.dispose();
  const layers = isMobile
    ? new Float32Array([-0.68, 0.68])
    : new Float32Array([-1, 0, 1]);
  geometry.setAttribute("aLayer", new THREE.InstancedBufferAttribute(layers, 1));
  geometry.instanceCount = layers.length;
  return geometry;
}

function createExitWakeGeometry(count: number) {
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
  const drift = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.07;
    const broadLobe = Math.sin(angle * 3 + 0.42) * 0.68;
    const fineLobe = Math.sin(angle * 7 - 1.15) * 0.24;
    angles[index] = angle;
    radii[index] = 6.45 + broadLobe + fineLobe + (Math.random() - 0.5) * 0.64;
    seeds[index] = Math.random();
    lengths[index] = 1.8 + Math.pow(Math.random(), 0.62) * 4.4;
    widths[index] = 0.22 + Math.random() * 0.48;
    brightness[index] = 0.42 + Math.random() * 0.53;
    drift[index] = Math.min(1, Math.max(
      0,
      0.5 + Math.sin(angle * 2.0 + 0.9) * 0.28 + (Math.random() - 0.5) * 0.12,
    ));
  }

  geometry.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angles, 1));
  geometry.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radii, 1));
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute("aLength", new THREE.InstancedBufferAttribute(lengths, 1));
  geometry.setAttribute("aWidth", new THREE.InstancedBufferAttribute(widths, 1));
  geometry.setAttribute("aBrightness", new THREE.InstancedBufferAttribute(brightness, 1));
  geometry.setAttribute("aDrift", new THREE.InstancedBufferAttribute(drift, 1));
  geometry.instanceCount = count;
  return geometry;
}

function createExitCrystalGeometry(count: number) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const clusterOrigins = new Float32Array(count * 3);
  const clusterVelocities = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const lifetimes = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const turbulence = new Float32Array(count);
  const seeds = new Float32Array(count);
  const swirls = new Float32Array(count);
  const clusterPhases = new Float32Array(count);

  const clusterCount = count > 1000 ? 20 : 13;
  const clusters = Array.from({ length: clusterCount }, (_, clusterIndex) => {
    const angle = (clusterIndex / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.36;
    const radius = 3.0 + Math.pow(Math.random(), 0.58) * 5.4;
    return {
      origin: new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.72,
        -6.8 - Math.random() * 6.2,
      ),
      velocity: new THREE.Vector3(
        Math.cos(angle) * (0.18 + Math.random() * 0.44),
        Math.sin(angle) * (0.14 + Math.random() * 0.38),
        -0.72 - Math.random() * 1.15,
      ),
      delay: Math.random() * 0.34,
      swirl: (Math.random() < 0.5 ? -1 : 1) * (1.35 + Math.random() * 1.9),
      phase: Math.random() * Math.PI * 2,
    };
  });

  for (let index = 0; index < count; index += 1) {
    const cluster = clusters[index % clusterCount];
    const localAngle = Math.random() * Math.PI * 2;
    const localRadius = Math.pow(Math.random(), 1.9) * (0.48 + Math.random() * 0.52);
    const offset = index * 3;
    positions[offset] = cluster.origin.x + Math.cos(localAngle) * localRadius;
    positions[offset + 1] = cluster.origin.y + Math.sin(localAngle) * localRadius * 0.7;
    positions[offset + 2] = cluster.origin.z + (Math.random() - 0.5) * 0.72;
    velocities[offset] = Math.cos(localAngle) * (0.08 + Math.random() * 0.42);
    velocities[offset + 1] = Math.sin(localAngle) * (0.08 + Math.random() * 0.38);
    velocities[offset + 2] = -Math.random() * 1.15;
    clusterOrigins[offset] = cluster.origin.x;
    clusterOrigins[offset + 1] = cluster.origin.y;
    clusterOrigins[offset + 2] = cluster.origin.z;
    clusterVelocities[offset] = cluster.velocity.x;
    clusterVelocities[offset + 1] = cluster.velocity.y;
    clusterVelocities[offset + 2] = cluster.velocity.z;
    delays[index] = cluster.delay + Math.random() * 0.2;
    lifetimes[index] = 3.8 + Math.random() * 1.7;
    const isMicroFrost = Math.random() < 0.78;
    sizes[index] = isMicroFrost
      ? 0.58 + Math.pow(Math.random(), 0.8) * 1.72
      : 2.4 + Math.pow(Math.random(), 0.72) * 4.6;
    brightness[index] = isMicroFrost ? 0.48 + Math.random() * 0.3 : 0.58 + Math.random() * 0.34;
    turbulence[index] = 0.52 + Math.random() * 1.05;
    seeds[index] = Math.random();
    swirls[index] = cluster.swirl;
    clusterPhases[index] = cluster.phase;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute("aLifetime", new THREE.BufferAttribute(lifetimes, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
  geometry.setAttribute("aTurbulence", new THREE.BufferAttribute(turbulence, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aClusterOrigin", new THREE.BufferAttribute(clusterOrigins, 3));
  geometry.setAttribute("aClusterVelocity", new THREE.BufferAttribute(clusterVelocities, 3));
  geometry.setAttribute("aSwirl", new THREE.BufferAttribute(swirls, 1));
  geometry.setAttribute("aClusterPhase", new THREE.BufferAttribute(clusterPhases, 1));
  return geometry;
}

function createExitDustGeometry(count: number) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const lifetimes = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const turbulence = new Float32Array(count);
  const seeds = new Float32Array(count);
  const drag = new Float32Array(count);
  const glints = new Float32Array(count);
  const clusterOrigins = new Float32Array(count * 3);
  const swirls = new Float32Array(count);
  const clusterPhases = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.56;
    const broadLobe = Math.sin(angle * 3 + 0.42) * 0.92;
    const fineLobe = Math.sin(angle * 7 - 1.15) * 0.34;
    const shellChoice = Math.random();
    const shellOffset = shellChoice < 0.6
      ? (Math.random() - 0.5) * 1.4
      : shellChoice < 0.82
        ? 0.8 + Math.random() * 2.25
        : -3.1 + Math.random() * 2.25;
    const ringRadius = 6.1 + broadLobe + fineLobe + shellOffset;
    const originX = Math.cos(angle) * ringRadius;
    const originY = Math.sin(angle) * ringRadius * 0.72 - 0.16;
    const originZ = 1.15
      + Math.pow(Math.random(), 1.3) * 7.4
      + (0.5 + 0.5 * Math.sin(angle * 2 - 0.7)) * 0.8;
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle) * 0.72;
    const radialX = Math.cos(angle);
    const radialY = Math.sin(angle) * 0.72;
    const along = (Math.random() - 0.5) * (0.72 + Math.pow(Math.random(), 1.55) * 1.9);
    const across = (Math.random() - 0.5) * (0.34 + Math.random() * 1.02);
    const radialSpeed = 0.2 + (0.5 + 0.5 * Math.sin(angle * 3 + 1.1)) * 0.42;
    const tangentialSpeed = Math.sin(angle * 2 + 0.35) * (0.18 + Math.random() * 0.22);
    const localTurbulence = 0.42 + (0.5 + 0.5 * Math.sin(angle * 3 + 1.1)) * 1.02;
    const localDrag = 0.46 + (0.5 + 0.5 * Math.sin(angle * 2.5 - 0.4)) * 0.72;
    const offset = index * 3;
    positions[offset] = originX + tangentX * along + radialX * across;
    positions[offset + 1] = originY + tangentY * along + radialY * across;
    positions[offset + 2] = originZ + (Math.random() - 0.5) * 1.1;
    velocities[offset] = radialX * radialSpeed + tangentX * tangentialSpeed + (Math.random() - 0.5) * 0.16;
    velocities[offset + 1] = radialY * radialSpeed + tangentY * tangentialSpeed + (Math.random() - 0.5) * 0.14;
    velocities[offset + 2] = 1.18 + (0.5 + 0.5 * Math.sin(angle * 2.0 + 0.8)) * 1.05 + (Math.random() - 0.5) * 0.34;
    clusterOrigins[offset] = originX;
    clusterOrigins[offset + 1] = originY;
    clusterOrigins[offset + 2] = originZ;
    delays[index] = Math.random() * 0.085;
    lifetimes[index] = 4.1 + Math.random() * 2.2;
    sizes[index] = 0.14 + Math.pow(Math.random(), 1.82) * 0.62;
    brightness[index] = 0.58 + Math.pow(Math.random(), 0.62) * 0.62;
    turbulence[index] = localTurbulence * (0.86 + Math.random() * 0.28);
    seeds[index] = Math.random();
    drag[index] = localDrag * (0.9 + Math.random() * 0.2);
    glints[index] = Math.random() < 0.18 ? 0.62 + Math.random() * 0.38 : 0;
    swirls[index] = Math.sin(angle * 2 + 0.6) * 0.48 + Math.sin(angle * 5 - 0.8) * 0.17;
    clusterPhases[index] = angle * 1.72 + Math.sin(angle * 3) * 0.52;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute("aLifetime", new THREE.BufferAttribute(lifetimes, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
  geometry.setAttribute("aTurbulence", new THREE.BufferAttribute(turbulence, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aDrag", new THREE.BufferAttribute(drag, 1));
  geometry.setAttribute("aGlint", new THREE.BufferAttribute(glints, 1));
  geometry.setAttribute("aClusterOrigin", new THREE.BufferAttribute(clusterOrigins, 3));
  geometry.setAttribute("aSwirl", new THREE.BufferAttribute(swirls, 1));
  geometry.setAttribute("aClusterPhase", new THREE.BufferAttribute(clusterPhases, 1));
  return geometry;
}

function createDeepSpaceWorld(isMobile: boolean) {
  const group = new THREE.Group();
  const fleet = new THREE.Group();
  const planetRadius = isMobile ? 16 : 18;
  const planetPosition = new THREE.Vector3(isMobile ? 10.5 : 14.5, 0.8, -58);
  const flagshipBaseY = -1.45;
  const interfaceAnchor = new THREE.Object3D();
  interfaceAnchor.position.set(0, 0, -118);
  group.add(interfaceAnchor);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

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

  const starCount = isMobile ? 2800 : 5200;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starIntensities = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  const starGlints = new Float32Array(starCount);
  const starColor = new THREE.Color();
  const starClusterCenters = [
    [-0.68, 0.34],
    [0.46, -0.13],
    [0.76, 0.4],
    [-0.08, 0.11],
  ] as const;
  for (let index = 0; index < starCount; index += 1) {
    // Keep the stellar field on a genuinely distant shell. Nearby stars read
    // like small objects floating beside the planet and flatten the scene.
    const depth = 180 + Math.pow(Math.random(), 0.52) * 150;
    const clusterRoll = Math.random();
    const clusterIndex = clusterRoll < 0.2
      ? Math.floor(Math.random() * starClusterCenters.length)
      : -1;
    let screenX: number;
    let screenY: number;
    let sitsInStellarBand = false;
    if (clusterIndex >= 0) {
      const cluster = starClusterCenters[clusterIndex];
      const clusterAngle = Math.random() * Math.PI * 2;
      const clusterRadius = Math.pow(Math.random(), 2.05) * (0.08 + Math.random() * 0.16);
      screenX = cluster[0] + Math.cos(clusterAngle) * clusterRadius;
      screenY = cluster[1] + Math.sin(clusterAngle) * clusterRadius * 0.68;
      sitsInStellarBand = true;
    } else {
      sitsInStellarBand = Math.random() < 0.58;
      screenX = (Math.random() - 0.5) * 2.18;
      const bandCenter = 0.16 - screenX * 0.23 + Math.sin(screenX * 3.2) * 0.045;
      screenY = sitsInStellarBand
        ? bandCenter + (Math.random() - 0.5) * (0.1 + Math.pow(Math.random(), 2.25) * 0.29)
        : (Math.random() - 0.5) * 1.34;
    }
    const positionOffset = index * 3;
    starPositions[positionOffset] = screenX * depth;
    starPositions[positionOffset + 1] = screenY * depth;
    starPositions[positionOffset + 2] = -depth;

    const temperature = Math.random();
    if (clusterIndex === 0 && temperature < 0.5) starColor.set(0x7dddf4);
    else if (clusterIndex === 1 && temperature < 0.34) starColor.set(0xffcf91);
    else if (clusterIndex === 2 && temperature < 0.44) starColor.set(0x9a9fff);
    else if (temperature < 0.58) starColor.set(0xdce9ef);
    else if (temperature < 0.74) starColor.set(0x86d9f0);
    else if (temperature < 0.86) starColor.set(0x9aa9ff);
    else if (temperature < 0.96) starColor.set(0xffd6a1);
    else starColor.set(0xff9b72);
    starColors[positionOffset] = starColor.r;
    starColors[positionOffset + 1] = starColor.g;
    starColors[positionOffset + 2] = starColor.b;

    const projectedPlanetX = planetPosition.x / -planetPosition.z;
    const projectedPlanetY = planetPosition.y / -planetPosition.z;
    const projectedPlanetRadius = planetRadius / -planetPosition.z;
    const distanceFromPlanet = Math.hypot(
      screenX - projectedPlanetX,
      screenY - projectedPlanetY,
    );
    const clearsPlanetaryNeighborhood = distanceFromPlanet > projectedPlanetRadius * 1.85;
    const heroStar = clearsPlanetaryNeighborhood && Math.random() < 0.014;
    const midStar = !heroStar && Math.random() < 0.105;
    starSizes[index] = heroStar
      ? 2.8 + Math.random() * 2.2
      : midStar
        ? 1.45 + Math.random() * 1.35
        : 0.46 + Math.pow(Math.random(), 1.95) * 0.72;
    const densityBoost = clusterIndex >= 0 ? 1.16 : sitsInStellarBand ? 1.08 : 1;
    starIntensities[index] = heroStar
      ? 0.82 + Math.random() * 0.18
      : (0.29 + Math.pow(Math.random(), 0.78) * 0.45) * densityBoost;
    starPhases[index] = Math.random();
    starGlints[index] = heroStar ? 0.58 + Math.random() * 0.42 : 0;
  }
  const starGeometry = trackGeometry(new THREE.BufferGeometry());
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute("aIntensity", new THREE.BufferAttribute(starIntensities, 1));
  starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(starPhases, 1));
  starGeometry.setAttribute("aGlint", new THREE.BufferAttribute(starGlints, 1));
  const starUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const starMaterial = trackMaterial(new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: environmentStarVertexShader,
    fragmentShader: environmentStarFragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const deepStars = new THREE.Points(starGeometry, starMaterial);
  deepStars.frustumCulled = false;
  deepStars.renderOrder = -12;
  group.add(deepStars);

  const veilCount = isMobile ? 360 : 680;
  const veilPositions = new Float32Array(veilCount * 3);
  const veilColors = new Float32Array(veilCount * 3);
  const veilSizes = new Float32Array(veilCount);
  const veilIntensities = new Float32Array(veilCount);
  const veilPhases = new Float32Array(veilCount);
  const veilColor = new THREE.Color();
  for (let index = 0; index < veilCount; index += 1) {
    const depth = 175 + Math.random() * 145;
    const bandX = (Math.random() - 0.5) * 2.28;
    const clusterWave = Math.sin(bandX * 2.7 + 0.8) * 0.055;
    const bandY = 0.16 - bandX * 0.23 + clusterWave
      + (Math.random() - 0.5) * (0.12 + Math.pow(Math.random(), 1.7) * 0.24);
    const positionOffset = index * 3;
    veilPositions[positionOffset] = bandX * depth;
    veilPositions[positionOffset + 1] = bandY * depth;
    veilPositions[positionOffset + 2] = -depth;

    const hueChoice = Math.random();
    if (hueChoice < 0.52) veilColor.set(0x237f9d);
    else if (hueChoice < 0.78) veilColor.set(0x334b9a);
    else if (hueChoice < 0.93) veilColor.set(0x694a8e);
    else veilColor.set(0x9a603f);
    veilColors[positionOffset] = veilColor.r;
    veilColors[positionOffset + 1] = veilColor.g;
    veilColors[positionOffset + 2] = veilColor.b;
    veilSizes[index] = 18 + Math.pow(Math.random(), 0.64) * 32;
    veilIntensities[index] = 0.019 + Math.pow(Math.random(), 1.6) * 0.043;
    veilPhases[index] = Math.random();
  }
  const veilGeometry = trackGeometry(new THREE.BufferGeometry());
  veilGeometry.setAttribute("position", new THREE.BufferAttribute(veilPositions, 3));
  veilGeometry.setAttribute("color", new THREE.BufferAttribute(veilColors, 3));
  veilGeometry.setAttribute("aSize", new THREE.BufferAttribute(veilSizes, 1));
  veilGeometry.setAttribute("aIntensity", new THREE.BufferAttribute(veilIntensities, 1));
  veilGeometry.setAttribute("aPhase", new THREE.BufferAttribute(veilPhases, 1));
  const veilUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const veilMaterial = trackMaterial(new THREE.ShaderMaterial({
    uniforms: veilUniforms,
    vertexShader: stellarVeilVertexShader,
    fragmentShader: stellarVeilFragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const stellarVeil = new THREE.Points(veilGeometry, veilMaterial);
  stellarVeil.frustumCulled = false;
  stellarVeil.renderOrder = -13;
  group.add(stellarVeil);

  const planetTexture = new THREE.TextureLoader().load(`${BASE_PATH}/textures/bv-alien-planet.webp`);
  planetTexture.colorSpace = THREE.SRGBColorSpace;
  planetTexture.wrapS = THREE.RepeatWrapping;
  planetTexture.anisotropy = 4;
  textures.push(planetTexture);
  const planetMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: planetTexture,
    roughness: 0.78,
    metalness: 0.02,
  }));
  const planetGeometry = trackGeometry(new THREE.SphereGeometry(planetRadius, isMobile ? 40 : 64, isMobile ? 24 : 40));
  const planet = new THREE.Mesh(planetGeometry, planetMaterial);
  planet.position.copy(planetPosition);
  planet.rotation.set(-0.08, -1.12, 0.04);
  group.add(planet);

  const atmosphereMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x318699,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const atmosphere = new THREE.Mesh(planetGeometry, atmosphereMaterial);
  atmosphere.scale.setScalar(1.024);
  atmosphere.position.copy(planet.position);
  group.add(atmosphere);

  const hullGeometry = trackGeometry(new THREE.BoxGeometry(1, 1, 1));
  const noseGeometry = trackGeometry(new THREE.ConeGeometry(1, 2.8, 4, 1));
  noseGeometry.rotateX(-Math.PI / 2);
  const engineGeometry = trackGeometry(new THREE.CircleGeometry(1, 24));
  const antennaGeometry = trackGeometry(new THREE.CylinderGeometry(0.035, 0.035, 1, 6));

  const hullMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0x46535b,
    metalness: 0.88,
    roughness: 0.2,
  }));
  const armorMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0x151b20,
    metalness: 0.8,
    roughness: 0.34,
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

  // Foreground contacts occupy their own depth band, well clear of the
  // planetary sphere. Smaller silhouettes deeper in frame sell orbital scale
  // without making a carrier look comparable to a world.
  const flagship = createShip(0.72, new THREE.Vector3(-7.2, flagshipBaseY, -27), 0.18);
  createShip(0.22, new THREE.Vector3(2.5, 4.8, -39), -0.2);
  createShip(0.17, new THREE.Vector3(-3.2, -4.2, -45), 0.28);
  createShip(0.15, new THREE.Vector3(-13.5, 3.5, -43), 0.08);
  group.add(fleet);

  let assetLoadCancelled = false;
  const disposeLoadedScene = (loadedScene: THREE.Object3D) => {
    const disposedGeometry = new Set<THREE.BufferGeometry>();
    const disposedMaterial = new Set<THREE.Material>();
    loadedScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!disposedGeometry.has(object.geometry)) {
        disposedGeometry.add(object.geometry);
        object.geometry.dispose();
      }
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const meshMaterial of meshMaterials) {
        if (!disposedMaterial.has(meshMaterial)) {
          disposedMaterial.add(meshMaterial);
          meshMaterial.dispose();
        }
      }
    });
  };

  new GLTFLoader().load(
    `${BASE_PATH}/models/Carrier.glb`,
    (gltf) => {
      if (assetLoadCancelled) {
        disposeLoadedScene(gltf.scene);
        return;
      }

      const sourceMaterials = new Set<THREE.Material>();
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const sourceGeometry = object.geometry;
        const gameGeometry = trackGeometry(sourceGeometry.clone());
        gameGeometry.computeVertexNormals();
        object.geometry = gameGeometry;
        sourceGeometry.dispose();
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const meshMaterial of meshMaterials) sourceMaterials.add(meshMaterial);
        object.material = hullMaterial;
      });
      for (const sourceMaterial of sourceMaterials) sourceMaterial.dispose();

      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 10.8 / Math.max(size.x, size.y, size.z, 0.001);
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.copy(center).multiplyScalar(-scale);
      flagship.clear();
      flagship.add(gltf.scene);
    },
    undefined,
    () => {
      // The procedural silhouette remains as a graceful offline fallback.
    },
  );

  const ringGeometry = trackGeometry(new THREE.TorusGeometry(planetRadius * 1.13, 0.022, 4, 128));
  const ringMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x44cad1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const orbitalRing = new THREE.Mesh(ringGeometry, ringMaterial);
  orbitalRing.position.copy(planet.position);
  orbitalRing.rotation.set(0, 0, 0.12);
  group.add(orbitalRing);

  const hemisphere = new THREE.HemisphereLight(0x78b7cf, 0x010204, 0.48);
  const keyLight = new THREE.DirectionalLight(0xf4f8ff, 7.2);
  keyLight.position.set(-14, 18, 9);
  const rimLight = new THREE.PointLight(0x63ddec, SCENE_RIM_BASE, 82, 1.55);
  rimLight.position.set(8, -3, -9);
  group.add(hemisphere, keyLight, rimLight);

  const setOpacity = (opacity: number) => {
    const eased = clamp01(opacity);
    for (const material of materials) material.opacity = eased;
    atmosphereMaterial.opacity = eased * 0.17;
    engineMaterial.opacity = eased * 0.92;
    ringMaterial.opacity = eased * 0.46;
    starUniforms.uOpacity.value = eased * 0.82;
    veilUniforms.uOpacity.value = eased;
  };

  const update = (elapsedSeconds: number) => {
    starUniforms.uTime.value = elapsedSeconds;
    veilUniforms.uTime.value = elapsedSeconds;
    deepStars.rotation.z = Math.sin(elapsedSeconds * 0.004) * 0.003;
    stellarVeil.rotation.z = -0.035 + Math.sin(elapsedSeconds * 0.0025) * 0.004;
  };

  const cancelAssetLoad = () => {
    assetLoadCancelled = true;
  };

  return { group, fleet, flagship, planet, orbitalRing, rimLight, interfaceAnchor, geometries, materials, textures, setOpacity, update, cancelAssetLoad };
}

export function HyperspaceIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipJumpRef = useRef(false);
  const interfaceTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HyperspaceAudio | null>(null);
  const [runId, setRunId] = useState(0);
  const [jumping, setJumping] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [experienceReady, setExperienceReady] = useState(false);
  const [needsEngagement, setNeedsEngagement] = useState(false);

  const engage = useCallback(() => {
    setNeedsEngagement(false);
    setExperienceReady(true);
    void audioRef.current?.start();
  }, []);

  const finish = useCallback(() => {
    skipJumpRef.current = true;
    window.sessionStorage.setItem(SEEN_KEY, "true");
    document.documentElement.classList.add("experience-arriving");
    if (interfaceTimerRef.current) window.clearTimeout(interfaceTimerRef.current);
    interfaceTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove("experience-arriving");
      document.documentElement.classList.add("experience-landed");
    }, 260);
    setJumping(false);
  }, []);

  const replay = useCallback(() => {
    skipJumpRef.current = false;
    setExperienceReady(true);
    void audioRef.current?.start();
    if (interfaceTimerRef.current) window.clearTimeout(interfaceTimerRef.current);
    document.documentElement.classList.remove("experience-arriving");
    document.documentElement.classList.remove("experience-landed");
    setJumping(true);
    setRunId((value) => value + 1);
  }, []);

  useEffect(() => {
    const captureMode = new URLSearchParams(window.location.search).get("capture") === "hyperspace";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasSeenJump = Boolean(window.sessionStorage.getItem(SEEN_KEY));
    const storedMuted = window.localStorage.getItem("black-vector-audio-muted") === "true";
    const audio = new HyperspaceAudio(storedMuted);
    audioRef.current = audio;
    audio.prepare();
    const readinessTimer = window.setTimeout(() => {
      setNeedsEngagement(captureMode ? false : !hasSeenJump && !reducedMotion);
      setExperienceReady(captureMode || hasSeenJump || reducedMotion);
    }, 0);

    const button = document.querySelector<HTMLButtonElement>("[data-audio-toggle]");
    const updateButton = () => {
      if (!button) return;
      button.textContent = audio.isMuted ? "AUDIO // OFF" : "AUDIO // ON";
      button.setAttribute("aria-pressed", String(!audio.isMuted));
    };
    const toggleAudio = () => {
      const muted = !audio.isMuted;
      audio.setMuted(muted);
      if (!muted) void audio.startMusic();
      window.localStorage.setItem("black-vector-audio-muted", String(muted));
      updateButton();
    };
    const startScoreOnGesture = () => {
      void audio.startMusic();
      window.removeEventListener("pointerdown", startScoreOnGesture);
      window.removeEventListener("keydown", startScoreOnGesture);
    };
    updateButton();
    button?.addEventListener("click", toggleAudio);
    if ((hasSeenJump || reducedMotion) && !storedMuted) {
      window.addEventListener("pointerdown", startScoreOnGesture, { once: true });
      window.addEventListener("keydown", startScoreOnGesture, { once: true });
    }
    return () => {
      window.clearTimeout(readinessTimer);
      button?.removeEventListener("click", toggleAudio);
      window.removeEventListener("pointerdown", startScoreOnGesture);
      window.removeEventListener("keydown", startScoreOnGesture);
      audio.dispose();
      audioRef.current = null;
    };
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
    if (fallback || !experienceReady) return;
    const captureMode = new URLSearchParams(window.location.search).get("capture") === "hyperspace";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldJump = captureMode || runId > 0 || (!window.sessionStorage.getItem(SEEN_KEY) && !reducedMotion);
    skipJumpRef.current = !shouldJump;
    document.documentElement.classList.remove("experience-arriving");
    document.documentElement.classList.toggle("experience-landed", !shouldJump);
    const settleTimer = !shouldJump
      ? window.setTimeout(() => setJumping(false), 0)
      : null;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        depth: true,
        preserveDrawingBuffer: captureMode,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      window.setTimeout(() => setFallback(true), 0);
      return;
    }

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(captureMode ? 0x000000 : 0x000104);
    const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 420);
    camera.position.set(0, 0, 0);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = SCENE_EXPOSURE;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const lensPass = new ShaderPass(gravitationalLensShader);
    lensPass.enabled = false;
    composer.addPass(renderPass);
    composer.addPass(lensPass);

    const uniforms = {
      uTravel: { value: 0 },
      uDepth: { value: DEPTH },
      uNear: { value: NEAR },
      uOpacity: { value: shouldJump ? 0.24 : 0 },
      uForwardStretch: { value: shouldJump ? 0.035 : 0 },
      uBackwardStretch: { value: shouldJump ? 0.035 : 1 },
      uWidthScale: { value: shouldJump ? 0.76 : 1 },
      uEnergy: { value: shouldJump ? 0.24 : 1 },
      uSymmetry: { value: shouldJump ? 1 : 0 },
      uWarpTension: { value: 0 },
      uWarpRelease: { value: 0 },
      uWarpPhase: { value: 0 },
      uWarpCruise: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const geometry = createTunnelGeometry(isMobile ? 1350 : 2300);
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

    const tunnelDustUniforms = {
      uTravel: { value: 0 },
      uDepth: { value: DEPTH },
      uOpacity: { value: 0 },
      uWarpTension: { value: 0 },
      uWarpRelease: { value: 0 },
      uWarpPhase: { value: 0 },
      uWarpCruise: { value: 0 },
    };
    const tunnelDustGeometry = createTunnelDustGeometry(isMobile ? 420 : 900);
    const tunnelDustMaterial = new THREE.ShaderMaterial({
      uniforms: tunnelDustUniforms,
      vertexShader: tunnelDustVertexShader,
      fragmentShader: tunnelDustFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const tunnelDust = new THREE.Points(tunnelDustGeometry, tunnelDustMaterial);
    tunnelDust.frustumCulled = false;
    tunnelDust.matrixAutoUpdate = false;
    tunnelDust.updateMatrix();
    tunnelDust.visible = shouldJump;
    scene.add(tunnelDust);

    const warpBubbleUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uTravel: { value: 0 },
      uCompression: { value: 0 },
      uRelease: { value: 0 },
      uCruise: { value: 0 },
      uImpact: { value: 0 },
    };
    const warpBubbleGeometry = createWarpBubbleGeometry(isMobile);
    const warpBubbleMaterial = new THREE.ShaderMaterial({
      uniforms: warpBubbleUniforms,
      vertexShader: warpBubbleVertexShader,
      fragmentShader: warpBubbleFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.BackSide,
    });
    const warpBubble = new THREE.Mesh(warpBubbleGeometry, warpBubbleMaterial);
    warpBubble.position.z = -DEPTH / 2;
    warpBubble.frustumCulled = false;
    warpBubble.matrixAutoUpdate = false;
    warpBubble.updateMatrix();
    warpBubble.visible = shouldJump;
    scene.add(warpBubble);

    const exitWakeUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const exitWakeGeometry = createExitWakeGeometry(isMobile ? 96 : 192);
    const exitWakeMaterial = new THREE.ShaderMaterial({
      uniforms: exitWakeUniforms,
      vertexShader: exitWakeVertexShader,
      fragmentShader: exitWakeFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const exitWake = new THREE.Mesh(exitWakeGeometry, exitWakeMaterial);
    exitWake.frustumCulled = false;
    exitWake.matrixAutoUpdate = false;
    exitWake.updateMatrix();
    exitWake.renderOrder = 7;
    // The legacy ribbon wake read as gray slivers after the jump. Diamond dust
    // now carries the entire exit reveal, so keep this layer disabled.
    exitWake.visible = false;
    scene.add(exitWake);

    const exitCrystalUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const exitCrystalGeometry = createExitCrystalGeometry(isMobile ? 900 : 1900);
    const exitCrystalMaterial = new THREE.ShaderMaterial({
      uniforms: exitCrystalUniforms,
      vertexShader: exitCrystalVertexShader,
      fragmentShader: exitCrystalFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const exitCrystals = new THREE.Points(exitCrystalGeometry, exitCrystalMaterial);
    exitCrystals.frustumCulled = false;
    exitCrystals.matrixAutoUpdate = false;
    exitCrystals.updateMatrix();
    exitCrystals.renderOrder = 9;
    exitCrystals.visible = false;
    scene.add(exitCrystals);

    const exitDustUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const exitDustGeometry = createExitDustGeometry(isMobile ? 16000 : 46000);
    const exitDustMaterial = new THREE.ShaderMaterial({
      uniforms: exitDustUniforms,
      vertexShader: exitDustVertexShader,
      fragmentShader: exitDustFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const exitDust = new THREE.Points(exitDustGeometry, exitDustMaterial);
    exitDust.frustumCulled = false;
    exitDust.matrixAutoUpdate = false;
    exitDust.updateMatrix();
    exitDust.renderOrder = 8;
    exitDust.visible = shouldJump;
    scene.add(exitDust);

    const world = createDeepSpaceWorld(isMobile);
    world.setOpacity(captureMode || shouldJump ? 0 : 1);
    scene.add(world.group);

    const worldAnchors = [
      {
        element: document.querySelector<HTMLElement>('[data-world-anchor="planet"]'),
        object: world.planet,
        offset: new THREE.Vector3(8.5, 8.4, 0),
      },
      {
        element: document.querySelector<HTMLElement>('[data-world-anchor="flagship"]'),
        object: world.flagship,
        offset: new THREE.Vector3(0, 2.1, 0),
      },
    ];
    const heroInterface = document.querySelector<HTMLElement>('[data-world-ui="hero"]');
    const projectedAnchor = new THREE.Vector3();
    const interfaceWorldPosition = new THREE.Vector3();
    const updateWorldAnchors = (interfaceArrival: number) => {
      for (const anchor of worldAnchors) {
        if (!anchor.element) continue;
        anchor.object.getWorldPosition(projectedAnchor);
        projectedAnchor.add(anchor.offset).project(camera);
        const offscreen = projectedAnchor.z > 1 || Math.abs(projectedAnchor.x) > 1.2 || Math.abs(projectedAnchor.y) > 1.2;
        const rawAnchorX = projectedAnchor.x * 0.5 + 0.5;
        const anchorX = anchor.element.dataset.worldAnchor === "flagship"
          ? THREE.MathUtils.clamp(rawAnchorX, isMobile ? 0.34 : 0.18, 0.92)
          : THREE.MathUtils.clamp(rawAnchorX, 0.08, isMobile ? 0.66 : 0.78);
        anchor.element.toggleAttribute("data-offscreen", offscreen);
        anchor.element.style.setProperty("--anchor-x", `${anchorX * 100}%`);
        anchor.element.style.setProperty("--anchor-y", `${(-projectedAnchor.y * 0.5 + 0.5) * 100}%`);
      }

      if (heroInterface) {
        world.interfaceAnchor.getWorldPosition(interfaceWorldPosition);
        const cameraDistance = camera.position.distanceTo(interfaceWorldPosition);
        projectedAnchor.copy(interfaceWorldPosition).project(camera);
        const interfaceScale = THREE.MathUtils.clamp(25 / Math.max(cameraDistance, 1), 0.16, isMobile ? 0.78 : 0.96);
        const interfaceYaw = THREE.MathUtils.lerp(-38, 2.5, interfaceArrival);
        const panelWidth = Math.min(720, Math.max(window.innerWidth - 48, 1));
        const safeGutter = isMobile ? 24 : 56;
        const projectedX = projectedAnchor.x * 0.5 + 0.5;
        const minimumCenterX = Math.min(0.46, (panelWidth * interfaceScale * 0.5 + safeGutter) / window.innerWidth);
        const safeCenterX = THREE.MathUtils.clamp(projectedX, minimumCenterX, 1 - minimumCenterX);
        heroInterface.style.setProperty("--ui-x", `${safeCenterX * 100}%`);
        heroInterface.style.setProperty("--ui-y", `${(-projectedAnchor.y * 0.5 + 0.5) * 100}%`);
        heroInterface.style.setProperty("--ui-scale", interfaceScale.toFixed(4));
        heroInterface.style.setProperty("--ui-yaw", `${interfaceYaw.toFixed(2)}deg`);
        heroInterface.style.setProperty("--ui-opacity", smoothstep((interfaceArrival - 0.08) / 0.42).toFixed(4));
      }
    };

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const largeFrame = width * height > 3_000_000;
      // The capture route uses a fixed 2x backing surface. With the native
      // 1280x720 viewport this produces a true 2560x1440 canvas that can be
      // read directly, bypassing browser compositor scaling and tile seams.
      const pixelRatio = captureMode
        ? 2
        : Math.min(window.devicePixelRatio || 1, largeFrame ? 1.25 : isMobile ? 1.35 : 1.6);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      lensPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      exitWakeUniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
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
    let landingStartTime: number | null = null;
    const cameraTarget = new THREE.Vector3(0, 0, -100);
    const desiredTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const interfaceFar = new THREE.Vector3(0, 0, -118);
    const interfaceNear = new THREE.Vector3(isMobile ? -7.5 : -13, isMobile ? 0.5 : -0.4, -26);
    const animate = (time: number) => {
      if (!startTime) {
        startTime = time;
        previousTime = time;
        if (!shouldJump) landingStartTime = time - 2000;
      }

      const elapsed = time - startTime;
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;

      if (!jumpComplete) {
        const progress = skipJumpRef.current ? 1 : clamp01(elapsed / DURATION);
        // Keep the light wall charging while acceleration begins so the short
        // traces stretch into hyperspace as one uninterrupted motion.
        const charge = smoothstep(progress / LAUNCH_PROGRESS);
        const launchProgress = clamp01((progress - LAUNCH_PROGRESS) / 0.014);
        const launch = 1 - Math.pow(1 - launchProgress, 4);
        const visualLaunch = smoothstep((progress - LAUNCH_PROGRESS) / 0.035);
        const tensionAttack = smoothstep((progress - 0.05) / 0.22);
        const tensionRelease = 1 - smoothstep((progress - LAUNCH_PROGRESS) / 0.028);
        const warpTension = tensionAttack * tensionRelease;
        const warpReleaseAttack = smoothstep((progress - LAUNCH_PROGRESS) / 0.014);
        const warpReleaseFade = 1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.295)) / 0.16);
        const warpRelease = warpReleaseAttack * warpReleaseFade;
        const launchImpulse = smoothstep((progress - (LAUNCH_PROGRESS - 0.002)) / 0.005)
          * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.025)) / 0.018));
        const warpPhase = clamp01((progress - LAUNCH_PROGRESS) / 0.21);
        const braking = smoothstep((progress - 0.84) / 0.055);
        const exitArrival = smoothstep((progress - 0.89) / 0.11);
        const lineGrowth = smoothstep((progress - 0.04) / (LAUNCH_PROGRESS - 0.04));
        const preLaunchSpeed = 0;
        const hyperspaceSpeed = 92;
        const speed = THREE.MathUtils.lerp(preLaunchSpeed, hyperspaceSpeed, launch) * (1 - braking) + 0.35 * braking;
        travel += speed * delta;
        uniforms.uTravel.value = travel;
        tunnelDustUniforms.uTravel.value = travel;
        const launchDust = launchImpulse * 0.22 + warpRelease * 0.24;
        tunnelDustUniforms.uOpacity.value = (
          0.025
          + charge * 0.04
          + launchDust
          + visualLaunch * 0.42
        ) * (1 - braking);
        tunnelDustUniforms.uWarpTension.value = warpTension;
        tunnelDustUniforms.uWarpRelease.value = warpRelease;
        tunnelDustUniforms.uWarpPhase.value = warpPhase;
        tunnelDustUniforms.uWarpCruise.value = visualLaunch * (1 - braking);
        warpBubbleUniforms.uTime.value = elapsed * 0.001;
        warpBubbleUniforms.uTravel.value = travel;
        warpBubbleUniforms.uCompression.value = warpTension;
        warpBubbleUniforms.uRelease.value = warpRelease;
        warpBubbleUniforms.uCruise.value = visualLaunch * (1 - braking);
        warpBubbleUniforms.uImpact.value = launchImpulse;
        warpBubbleUniforms.uOpacity.value = (
          warpTension * 0.075
            + warpRelease * 0.62
            + visualLaunch * 0.96
            + launchImpulse * 0.13
        ) * (1 - braking);
        const lensTravelFade = 1 - smoothstep(
          (progress - (LAUNCH_PROGRESS + 0.08)) / 0.14,
        );
        const lensRelease = launchImpulse + warpRelease * lensTravelFade * 0.42;
        const cruiseLens = visualLaunch * (1 - braking);
        const cruiseBreath = 0.17 + Math.sin(elapsed * 0.00072) * 0.022;
        const lensStrength = (
          warpTension * 0.94
          + lensRelease * 1.04
          + cruiseLens * cruiseBreath
        ) * (1 - braking);
        lensPass.enabled = lensStrength > 0.002;
        lensPass.uniforms.uStrength.value = lensStrength;
        lensPass.uniforms.uRadius.value = 0.045
          + charge * 0.125
          - cruiseLens * 0.038
          + launchImpulse * 0.03;
        lensPass.uniforms.uStretch.value = warpTension * 0.004
          + launchImpulse * 0.078
          + warpRelease * lensTravelFade * 0.032
          + cruiseLens * 0.0035;
        lensPass.uniforms.uFlash.value = launchImpulse;
        lensPass.uniforms.uTime.value = elapsed * 0.001;
        lensPass.uniforms.uCruise.value = cruiseLens;
        lensPass.uniforms.uDarkness.value = Math.min(
          1,
          warpTension * 0.78 + launchImpulse * 0.28 + cruiseLens * 0.07,
        );
        const stretchCharge = Math.pow(lineGrowth, 0.7);
        const staticStretch = THREE.MathUtils.lerp(0.035, 0.52, stretchCharge);
        uniforms.uForwardStretch.value = staticStretch * (1 - braking) + braking * 0.01;
        uniforms.uBackwardStretch.value = (staticStretch + visualLaunch * 0.89) * (1 - braking) + braking * 0.03;
        uniforms.uWidthScale.value = (0.76 + charge * 0.4 + visualLaunch * 0.38) * (1 - braking * 0.35);
        uniforms.uEnergy.value = (0.24 + charge * 0.88 + visualLaunch * 0.18) * (1 - braking * 0.48);
        uniforms.uSymmetry.value = 1 - visualLaunch;
        uniforms.uWarpTension.value = warpTension;
        uniforms.uWarpRelease.value = warpRelease;
        uniforms.uWarpPhase.value = warpPhase;
        uniforms.uWarpCruise.value = visualLaunch * (1 - braking);
        uniforms.uOpacity.value = smoothstep(progress / 0.015)
          * (0.24 + charge * 0.76)
          * (1 - visualLaunch * 0.14)
          * (1 - smoothstep((progress - 0.88) / 0.055));
        exitWakeUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.825) / 1000);
        exitWakeUniforms.uOpacity.value = smoothstep((progress - 0.828) / 0.045) * 0.34;
        exitCrystalUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.872) / 1000);
        exitCrystalUniforms.uOpacity.value = 0;
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.825) / 1000);
        exitDustUniforms.uOpacity.value = smoothstep((progress - 0.828) / 0.045);
        world.setOpacity(captureMode ? 0 : smoothstep((progress - 0.9) / 0.085));
        const exitIllumination = smoothstep((progress - 0.842) / 0.042)
          * (1 - smoothstep((progress - 0.982) / 0.034));
        world.rimLight.intensity = SCENE_RIM_BASE + exitIllumination * EXIT_RIM_BOOST;
        renderer.toneMappingExposure = 1.0
          + charge * 0.11
          + launch * 0.08
          + launchImpulse * 0.12
          + warpRelease * 0.035
          + exitIllumination * 0.13;

        const launchLocal = clamp01((progress - LAUNCH_PROGRESS) / 0.11);
        const pressureDrift = warpTension * (1 - launch) * 0.018;
        const impactKick = smoothstep((progress - (LAUNCH_PROGRESS - 0.002)) / 0.004)
          * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.018)) / 0.016));
        const launchShake = smoothstep((progress - LAUNCH_PROGRESS) / 0.004)
          * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.07)) / 0.06));
        const brakingShake = smoothstep((progress - 0.82) / 0.05)
          * (1 - smoothstep((progress - 0.965) / 0.035));
        const cruiseShake = visualLaunch * (1 - braking) * 0.005;
        const impactDecay = launchShake * (1 - smoothstep(launchLocal));
        const shakeStrength = impactKick * 0.22
          + impactDecay * 0.14
          + launchShake * 0.045
          + brakingShake * 0.032
          + cruiseShake;
        const cameraDive = smoothstep((progress - (LAUNCH_PROGRESS + 0.014)) / 0.018)
          * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.12)) / 0.08));
        const launchRecoil = impactKick * 1.5;
        const shakeX = Math.sin(elapsed * 0.043)
          + Math.sin(elapsed * 0.071 + 1.7) * 0.38;
        const shakeY = Math.cos(elapsed * 0.037 + 0.6)
          + Math.sin(elapsed * 0.083) * 0.31;
        const shakeZ = Math.sin(elapsed * 0.052 + 2.1)
          + Math.sin(elapsed * 0.097) * 0.24;
        camera.position.x = shakeX * shakeStrength
          + Math.sin(elapsed * 0.0018) * pressureDrift;
        camera.position.y = shakeY * shakeStrength * 0.7
          - pressureDrift * 0.42;
        camera.position.z = -0.9 * exitArrival
          + launchRecoil * 0.86
          - cameraDive * 1.75
          + shakeZ * shakeStrength * 0.28;
        cameraTarget.set(
          shakeX * shakeStrength * 0.76 + impactKick * 0.08,
          shakeY * shakeStrength * 0.5 - impactKick * 0.075,
          THREE.MathUtils.lerp(-100, -38, exitArrival),
        );
        camera.lookAt(cameraTarget);
        camera.rotation.z += shakeX * shakeStrength * 0.022;
        camera.fov = 62
          + charge * 2.5
          - warpTension * 9.5
          + launch * 21.5
          + impactKick * 12.5
          + cameraDive * 4.5
          - braking * 23.5;
        camera.updateProjectionMatrix();

        if (progress >= 1) {
          jumpComplete = true;
          landingStartTime = time;
          tunnel.visible = false;
          tunnelDust.visible = false;
          warpBubble.visible = false;
          lensPass.enabled = false;
          world.setOpacity(captureMode ? 0 : 1);
          renderer.toneMappingExposure = SCENE_EXPOSURE;
          if (!finishQueued) {
            finishQueued = true;
            if (!captureMode) finish();
          }
        }
      } else {
        const landingElapsed = landingStartTime === null ? 1600 : Math.max(0, time - landingStartTime);
        const wakeFade = 1 - smoothstep(landingElapsed / 3500);
        const dustFade = 1 - smoothstep(landingElapsed / 4200);
        exitWakeUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.825) / 1000);
        exitWakeUniforms.uOpacity.value = wakeFade * 0.34;
        exitCrystalUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.872) / 1000);
        exitCrystalUniforms.uOpacity.value = 0;
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.825) / 1000);
        exitDustUniforms.uOpacity.value = dustFade;
        world.rimLight.intensity = SCENE_RIM_BASE
          + (exitDust.visible ? dustFade * EXIT_RIM_BOOST * 0.46 : 0);
        if (wakeFade <= 0.001) {
          exitWake.visible = false;
          exitCrystals.visible = false;
        }
        if (dustFade <= 0.001) exitDust.visible = false;
        const interfaceArrival = landingStartTime === null
          ? 1
          : smoothstep((time - landingStartTime - 100) / 1450);
        world.interfaceAnchor.position.lerpVectors(interfaceFar, interfaceNear, interfaceArrival);
        const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const scrollProgress = clamp01(window.scrollY / documentHeight);
        desiredCamera.set(
          scrollProgress * 6.5,
          -scrollProgress * 3.2,
          -0.9 - scrollProgress * 10.5,
        );
        const cameraDamping = 1 - Math.pow(0.004, delta);
        camera.position.lerp(desiredCamera, cameraDamping);
        desiredTarget.set(
          -scrollProgress * 2,
          scrollProgress * 0.4,
          -38 - scrollProgress * 12,
        );
        cameraTarget.lerp(desiredTarget, cameraDamping);
        camera.lookAt(cameraTarget);
        camera.fov = THREE.MathUtils.lerp(camera.fov, 64 - scrollProgress * 2, cameraDamping);
        camera.updateProjectionMatrix();

        world.fleet.rotation.y = Math.sin(elapsed * 0.00008) * 0.022;
        world.flagship.position.y = -1.45 + Math.sin(elapsed * 0.00034) * 0.08;
        world.planet.rotation.y = -1.12 + elapsed * 0.000008;
        world.orbitalRing.rotation.z = 0.12 + elapsed * 0.000018;
      }

      const currentInterfaceArrival = jumpComplete && landingStartTime !== null
        ? smoothstep((time - landingStartTime - 100) / 1450)
        : jumpComplete ? 1 : 0;
      world.update(elapsed * 0.001);
      updateWorldAnchors(currentInterfaceArrival);
      if (lensPass.enabled) composer.render(delta);
      else renderer.render(scene, camera);
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
      uniforms.uForwardStretch.value = 0;
      uniforms.uBackwardStretch.value = 0.85;
      uniforms.uWidthScale.value = 1;
      uniforms.uEnergy.value = 1;
      uniforms.uSymmetry.value = 0;
      renderer.setRenderTarget(probeTarget);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(probeTarget, 0, 0, 64, 36, probePixels);
      renderer.setRenderTarget(null);
      probeTarget.dispose();
      uniforms.uResolution.value.copy(fullResolution);
      uniforms.uTravel.value = 0;
      uniforms.uOpacity.value = 0.24;
      uniforms.uForwardStretch.value = 0.035;
      uniforms.uBackwardStretch.value = 0.035;
      uniforms.uWidthScale.value = 0.76;
      uniforms.uEnergy.value = 0.24;
      uniforms.uSymmetry.value = 1;
      const hasLightGeometry = probePixels.some((value, index) => index % 4 !== 3 && value > 6);
      if (!hasLightGeometry) {
        geometry.dispose();
        material.dispose();
        tunnelDustGeometry.dispose();
        tunnelDustMaterial.dispose();
        warpBubbleGeometry.dispose();
        warpBubbleMaterial.dispose();
        exitWakeGeometry.dispose();
        exitWakeMaterial.dispose();
        exitCrystalGeometry.dispose();
        exitCrystalMaterial.dispose();
        exitDustGeometry.dispose();
        exitDustMaterial.dispose();
        for (const item of world.geometries) item.dispose();
        for (const item of world.materials) item.dispose();
        for (const item of world.textures) item.dispose();
        world.cancelAssetLoad();
        lensPass.dispose();
        renderPass.dispose();
        composer.dispose();
        renderer.dispose();
        window.setTimeout(() => setFallback(true), 0);
        return;
      }
    }

    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", onContextLost);
    if (captureMode) {
      window.__BV_CAPTURE_READY__ = true;
      window.__BV_CAPTURE_RENDER__ = (timeMs: number) => animate(1000 + timeMs);
      window.__BV_CAPTURE_RENDER__(0);
    } else {
      renderer.setAnimationLoop(animate);
    }

    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      renderer.setAnimationLoop(null);
      if (captureMode) {
        delete window.__BV_CAPTURE_READY__;
        delete window.__BV_CAPTURE_RENDER__;
      }
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.remove(tunnel);
      scene.remove(tunnelDust);
      scene.remove(warpBubble);
      scene.remove(exitWake);
      scene.remove(exitCrystals);
      scene.remove(exitDust);
      geometry.dispose();
      material.dispose();
      tunnelDustGeometry.dispose();
      tunnelDustMaterial.dispose();
      warpBubbleGeometry.dispose();
      warpBubbleMaterial.dispose();
      exitWakeGeometry.dispose();
      exitWakeMaterial.dispose();
      exitCrystalGeometry.dispose();
      exitCrystalMaterial.dispose();
      exitDustGeometry.dispose();
      exitDustMaterial.dispose();
      world.cancelAssetLoad();
      for (const item of world.geometries) item.dispose();
      for (const item of world.materials) item.dispose();
      for (const item of world.textures) item.dispose();
      lensPass.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [experienceReady, fallback, finish, runId]);

  useEffect(() => () => {
    if (interfaceTimerRef.current) window.clearTimeout(interfaceTimerRef.current);
    document.documentElement.classList.remove("experience-arriving");
  }, []);

  if (fallback) return <HyperspaceIntro2D />;

  return (
    <>
      {needsEngagement && (
        <button className="cinema-gate" type="button" onClick={engage}>
          <span>BLACK VECTOR // CINEMATIC EXPERIENCE</span>
          <strong>INITIATE TRANSIT</strong>
          <small>CINEMATIC AUDIO ENABLED</small>
        </button>
      )}
      <div
        className={`space-experience${jumping ? " is-jumping" : " is-landed"}`}
        aria-label={jumping ? "Three-dimensional hyperspace transit sequence" : "Three-dimensional Black Vector fleet theater"}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </>
  );
}
