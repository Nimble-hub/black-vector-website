"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HyperspaceIntro2D } from "./hyperspace-intro-2d";
import { HyperspaceAudio } from "./hyperspace-audio";

const DURATION = 15000;
const DEPTH = 132;
const NEAR = 0.68;
const SEEN_KEY = "black-vector-jump-seen-3d-v20";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
  uniform vec2 uResolution;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;

  void main() {
    float travel = mod(aSeedZ + uTravel, uDepth);
    float anchorZ = min(-uDepth + travel, -uNear);
    float headZ = min(anchorZ + aLength * uForwardStretch, -uNear);
    float tailZ = anchorZ - aLength * uBackwardStretch;
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius;

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
    float shoulder = (1.0 - smoothstep(0.3, 0.98, side)) * 0.12;
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
    vec3 color = mix(edgeColor, coreWhite, core * 0.88);
    float intensity = vBrightness * headExposure * (0.82 + core * 1.4) * uEnergy;
    float profile = min(body + shoulder, 1.0);
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

  varying float vBrightness;
  varying float vLife;

  void main() {
    float travel = mod(aSeedZ + uTravel * 1.12, uDepth);
    float z = -uDepth + travel;
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius;
    vec4 viewPosition = modelViewMatrix * vec4(radial, z, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * (18.0 / max(-viewPosition.z, 1.0)), 0.7, 4.2);

    vBrightness = aBrightness;
    vLife = smoothstep(0.0, 12.0, travel)
      * (1.0 - smoothstep(uDepth - 5.0, uDepth, travel))
      * uOpacity;
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

  varying vec2 vFieldUv;
  varying float vLayer;
  varying float vPulse;
  varying float vDistortion;
  varying float vFresnel;

  void main() {
    float angle = atan(position.y, position.x);
    float depth = uv.y;
    float layerPhase = aLayer * 2.0943951;
    float pulse = pow(
      0.5 + 0.5 * sin(
        depth * 14.0 - uTravel * 0.19 + sin(angle * 2.3 + layerPhase) * 1.7
      ),
      6.0
    );
    float macroWave = sin(
      depth * 21.0 - uTravel * 0.16 + angle * 3.1 + layerPhase
        + sin(angle * 5.0 - depth * 8.0 + uTime * 1.2) * 0.9
    );
    float pressureWave = sin(
      depth * 56.0 - uTravel * 0.47 - uTime * 3.4
        + sin(angle * 7.0 + depth * 11.0 - layerPhase) * 1.15
    );
    float displacement = macroWave * 0.48 + pressureWave * (0.12 + pulse * 0.34);
    vec2 radial = normalize(position.xy);
    float radialOffset = aLayer * 1.35;
    float twist = sin(depth * 12.0 - uTravel * 0.08 + layerPhase) * 0.045;
    float twistCos = cos(twist);
    float twistSin = sin(twist);
    vec3 displacedPosition = position;
    displacedPosition.xy += radial * (radialOffset + displacement);
    displacedPosition.xy = mat2(twistCos, -twistSin, twistSin, twistCos) * displacedPosition.xy;
    displacedPosition.z += sin(angle * 4.0 + depth * 18.0 - uTime * 2.1 + layerPhase) * pulse * 0.24;

    vec4 viewPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vec3 viewDirection = normalize(-viewPosition.xyz);
    vFieldUv = uv;
    vLayer = aLayer;
    vPulse = pulse;
    vDistortion = abs(displacement);
    vFresnel = pow(1.0 - abs(dot(viewNormal, viewDirection)), 1.35);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const warpBubbleFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uTravel;

  varying vec2 vFieldUv;
  varying float vLayer;
  varying float vPulse;
  varying float vDistortion;
  varying float vFresnel;

  void main() {
    float angle = vFieldUv.x * 6.2831853;
    float depth = vFieldUv.y;
    float layerPhase = vLayer * 2.0943951;
    float domainWarpA = sin(
      angle * 2.7 + depth * 17.0 - uTime * 1.8 + layerPhase
    ) * 0.74 + sin(
      angle * 6.3 - depth * 9.0 + uTime * 0.9 - layerPhase
    ) * 0.31;
    float domainWarpB = sin(
      angle * 4.6 - depth * 12.0 + uTime * 1.35 + layerPhase
    ) * 0.58 + sin(
      angle * 8.1 + depth * 7.0 - uTime * 0.72
    ) * 0.22;

    float plasmaA = 0.5 + 0.5 * sin(
      angle * 4.2 + depth * 26.0 - uTravel * 0.22 + domainWarpA * 2.2
    );
    float plasmaB = 0.5 + 0.5 * sin(
      angle * 7.1 - depth * 19.0 + uTravel * 0.13 + domainWarpB * 1.8 + layerPhase
    );
    float turbulentPlasma = smoothstep(0.54, 0.94, plasmaA * 0.58 + plasmaB * 0.42);

    float shockFront = pow(
      0.5 + 0.5 * sin(
        depth * 43.0 - uTravel * 0.42 + domainWarpA * 2.6 + layerPhase
      ),
      15.0
    );
    float pressureFront = pow(
      0.5 + 0.5 * sin(
        depth * 15.0 - uTravel * 0.18 + domainWarpB * 1.3 - layerPhase
      ),
      8.0
    );

    float branchField = abs(sin(
      angle * 1.85 + depth * 32.0 - uTravel * 0.31
        + sin(angle * 5.2 - depth * 13.0 + uTime * 2.3) * 1.8
        + layerPhase
    ));
    float arcHalo = 1.0 - smoothstep(0.025, 0.18, branchField);
    float arcCore = 1.0 - smoothstep(0.006, 0.045, branchField);
    float stormGate = clamp(shockFront + pressureFront * turbulentPlasma, 0.0, 1.0);
    float electricArc = (arcHalo * 0.32 + arcCore * 1.28) * stormGate;

    float membrane = turbulentPlasma * (0.055 + pressureFront * 0.25)
      * (0.32 + vFresnel * 0.92);
    float shockEnergy = shockFront * (0.2 + turbulentPlasma * 0.72)
      * (0.46 + vFresnel * 0.7 + vPulse * 0.5);
    float distortionGlow = vDistortion * pressureFront * 0.16;
    float energy = membrane + shockEnergy + electricArc + distortionGlow;
    float depthFade = smoothstep(0.015, 0.1, depth)
      * (1.0 - smoothstep(0.92, 0.995, depth));
    float layerWeight = mix(0.58, 1.0, 1.0 - abs(vLayer));
    float alpha = energy * layerWeight * depthFade * uOpacity;
    vec3 deepWarpBlue = vec3(0.015, 0.09, 0.42);
    vec3 ionCyan = vec3(0.08, 0.64, 1.0);
    vec3 lightningWhite = vec3(0.94, 0.992, 1.0);
    vec3 plasmaColor = mix(deepWarpBlue, ionCyan, turbulentPlasma * 0.72 + shockFront * 0.28);
    float whiteHot = clamp(arcCore * stormGate + shockFront * 0.54, 0.0, 1.0);
    vec3 color = mix(plasmaColor, lightningWhite, whiteHot);
    gl_FragColor = vec4(color * (0.46 + shockEnergy * 0.8 + whiteHot * 1.65), alpha);
  }
`;

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

  void main() {
    float cycle = fract(aSeed + uTime * (0.42 + aDrift * 0.18));
    float advance = pow(cycle, 1.55);
    float headZ = mix(-86.0, -0.82, advance);
    float tailZ = headZ - aLength * (0.45 + cycle * 1.4);
    float radialScale = mix(0.52, 1.55, pow(cycle, 1.2));
    vec2 radial = vec2(cos(aAngle), sin(aAngle)) * aRadius * radialScale;

    vec4 clipTail = projectionMatrix * modelViewMatrix * vec4(radial, tailZ, 1.0);
    vec4 clipHead = projectionMatrix * modelViewMatrix * vec4(radial, headZ, 1.0);
    vec2 ndcTail = clipTail.xy / clipTail.w;
    vec2 ndcHead = clipHead.xy / clipHead.w;
    vec2 screenTail = ndcTail * uResolution * 0.5;
    vec2 screenHead = ndcHead * uResolution * 0.5;
    vec2 direction = normalize(screenHead - screenTail + vec2(0.00001));
    vec2 perpendicular = vec2(direction.y, -direction.x);
    float perspectiveWidth = clamp(13.0 / max(clipHead.w, 0.5), 0.75, 4.0);
    float halfWidth = max(aWidth * perspectiveWidth, 1.05);

    float along = uv.y;
    vec2 screenPosition = mix(screenTail, screenHead, along);
    screenPosition += perpendicular * uv.x * halfWidth;
    vec2 ndcPosition = screenPosition / (uResolution * 0.5);
    float clipW = mix(clipTail.w, clipHead.w, along);
    float ndcZ = mix(clipTail.z / clipTail.w, clipHead.z / clipHead.w, along);

    gl_Position = vec4(ndcPosition * clipW, ndcZ * clipW, clipW);
    vShardUv = uv;
    vBrightness = aBrightness;
    vLife = smoothstep(0.0, 0.08, cycle) * (1.0 - smoothstep(0.72, 1.0, cycle)) * uOpacity;
  }
`;

const exitWakeFragmentShader = `
  precision highp float;

  varying vec2 vShardUv;
  varying float vBrightness;
  varying float vLife;

  void main() {
    float taper = mix(0.08, 1.0, smoothstep(0.0, 0.82, vShardUv.y));
    float side = abs(vShardUv.x) / max(taper, 0.001);
    float shard = 1.0 - smoothstep(0.34, 0.94, side);
    float tail = smoothstep(0.0, 0.2, vShardUv.y);
    float tip = 1.0 - smoothstep(0.965, 1.0, vShardUv.y);
    float crystal = smoothstep(0.7, 0.96, vShardUv.y) * tip;
    float alpha = shard * tail * tip * vLife * vBrightness;
    vec3 ice = mix(vec3(0.28, 0.72, 1.0), vec3(0.97, 0.995, 1.0), crystal);
    gl_FragColor = vec4(ice * (0.7 + crystal * 1.8), alpha);
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
    float active = step(aDelay, uTime) * (1.0 - step(aLifetime, age));
    float fade = smoothstep(0.0, 0.055, life) * (1.0 - smoothstep(0.68, 1.0, life));

    vec3 localOffset = position - aClusterOrigin;
    float roll = age * aSwirl + sin(age * 1.45 + aClusterPhase) * 0.34;
    float rollCos = cos(roll);
    float rollSin = sin(roll);
    localOffset.xy = mat2(rollCos, -rollSin, rollSin, rollCos) * localOffset.xy;
    localOffset *= 1.0 + age * 0.24;

    float curl = sin(age * 2.35 + aClusterPhase + aSeed * 1.7);
    float eddy = cos(age * 1.72 + aClusterPhase * 1.31 + aSeed * 2.4);
    vec3 windRoll = vec3(curl, eddy * 0.72, curl * eddy * 0.42);
    windRoll *= aTurbulence * smoothstep(0.0, 0.22, age) * (0.7 + age * 0.38);

    vec3 clusterPosition = aClusterOrigin + aClusterVelocity * age;
    vec3 particlePosition = clusterPosition + localOffset + aVelocity * age + windRoll;
    vec4 viewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float facetShimmer = 0.92 + sin(age * (4.0 + aSeed * 3.0) + aSeed * 31.0) * 0.08;
    gl_PointSize = clamp(aSize * facetShimmer * (12.0 / max(-viewPosition.z, 1.0)), 1.35, 22.0);

    vLife = active * fade * uOpacity;
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
  attribute float aSparkle;
  attribute vec3 aClusterOrigin;
  attribute float aSwirl;
  attribute float aClusterPhase;

  uniform float uTime;
  uniform float uOpacity;

  varying float vLife;
  varying float vBrightness;
  varying float vSparkle;
  varying float vTwinkle;

  void main() {
    float age = max(uTime - aDelay, 0.0);
    float life = clamp(age / aLifetime, 0.0, 1.0);
    float active = step(aDelay, uTime) * (1.0 - step(aLifetime, age));
    float fade = smoothstep(0.0, 0.045, life) * (1.0 - smoothstep(0.7, 1.0, life));

    vec3 localOffset = position - aClusterOrigin;
    float spin = age * aSwirl + sin(age * 1.9 + aClusterPhase) * 0.28;
    float spinCos = cos(spin);
    float spinSin = sin(spin);
    localOffset.xy = mat2(spinCos, -spinSin, spinSin, spinCos) * localOffset.xy;
    localOffset *= 1.0 + age * (0.16 + aSeed * 0.11);

    float gustStrength = aTurbulence * smoothstep(0.0, 0.18, age) * (0.44 + age * 0.38);
    vec3 gust = vec3(
      sin(age * 2.85 + aClusterPhase + aSeed * 2.0),
      cos(age * 2.35 + aClusterPhase * 1.17 + aSeed * 1.6),
      sin(age * 1.95 + aClusterPhase + aSeed * 2.4) * 0.36
    ) * gustStrength;
    vec3 particlePosition = aClusterOrigin + localOffset + aVelocity * age + gust;
    vec4 viewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float sparkleWave = pow(
      0.5 + 0.5 * sin(uTime * (7.0 + aSeed * 4.5) + aSeed * 83.0),
      10.0
    );
    float sparkleSize = 1.0 + aSparkle * sparkleWave * 2.35;
    gl_PointSize = clamp(aSize * sparkleSize * (24.0 / max(-viewPosition.z, 1.0)), 1.25, 28.0);

    vLife = active * fade * uOpacity;
    vBrightness = aBrightness;
    vSparkle = aSparkle;
    vTwinkle = sparkleWave;
  }
`;

const exitDustFragmentShader = `
  precision highp float;

  varying float vLife;
  varying float vBrightness;
  varying float vSparkle;
  varying float vTwinkle;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceFromCenter = length(point);
    float grain = 1.0 - smoothstep(0.2, 0.5, distanceFromCenter);
    float core = 1.0 - smoothstep(0.0, 0.14, distanceFromCenter);
    float verticalGlint = 1.0 - smoothstep(0.012, 0.055, abs(point.x));
    float horizontalGlint = 1.0 - smoothstep(0.012, 0.055, abs(point.y));
    float diagonalGlintA = 1.0 - smoothstep(0.014, 0.06, abs(point.x - point.y) * 0.7071);
    float diagonalGlintB = 1.0 - smoothstep(0.014, 0.06, abs(point.x + point.y) * 0.7071);
    float glintFalloff = 1.0 - smoothstep(0.12, 0.49, distanceFromCenter);
    float crossGlint = max(verticalGlint, horizontalGlint);
    float diagonalGlint = max(diagonalGlintA, diagonalGlintB) * 0.72;
    float glint = max(crossGlint, diagonalGlint) * glintFalloff * vSparkle * vTwinkle;
    float shape = max(grain, glint);
    vec3 iceBlue = vec3(0.28, 0.7, 1.0);
    vec3 frostWhite = vec3(0.95, 0.995, 1.0);
    vec3 color = mix(iceBlue, frostWhite, core * 0.62 + glint * 0.82);
    float alpha = shape * vLife * vBrightness * (0.74 + core * 0.5 + glint * 0.72);
    gl_FragColor = vec4(color * (0.82 + core * 0.92 + glint * 1.8), alpha);
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
    18.2,
    18.2,
    DEPTH,
    isMobile ? 36 : 64,
    isMobile ? 40 : 72,
    true,
  );
  baseGeometry.rotateX(Math.PI / 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.copy(baseGeometry);
  baseGeometry.dispose();
  geometry.setAttribute(
    "aLayer",
    new THREE.InstancedBufferAttribute(new Float32Array([-1, 0, 1]), 1),
  );
  geometry.instanceCount = 3;
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
    angles[index] = Math.random() * Math.PI * 2;
    radii[index] = 2.2 + Math.pow(Math.random(), 0.72) * 9.8;
    seeds[index] = Math.random();
    lengths[index] = 0.7 + Math.pow(Math.random(), 0.48) * 4.4;
    widths[index] = 0.28 + Math.random() * 0.44;
    brightness[index] = 0.46 + Math.random() * 0.54;
    drift[index] = Math.random();
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

  const clusterCount = count > 1000 ? 18 : 12;
  const clusters = Array.from({ length: clusterCount }, (_, clusterIndex) => {
    const angle = (clusterIndex / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.36;
    const radius = 1.45 + Math.random() * 2.65;
    return {
      origin: new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.68,
        -4.2 - Math.random() * 3.2,
      ),
      velocity: new THREE.Vector3(
        Math.cos(angle) * (0.42 + Math.random() * 0.92),
        Math.sin(angle) * (0.3 + Math.random() * 0.68),
        -2.8 - Math.random() * 3,
      ),
      delay: Math.random() * 0.45,
      swirl: (Math.random() < 0.5 ? -1 : 1) * (2.3 + Math.random() * 2.9),
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
    lifetimes[index] = 2.6 + Math.random() * 1.2;
    const isMicroFrost = Math.random() < 0.72;
    sizes[index] = isMicroFrost
      ? 0.7 + Math.pow(Math.random(), 0.7) * 2.4
      : 4.4 + Math.pow(Math.random(), 0.72) * 7.2;
    brightness[index] = isMicroFrost ? 0.42 + Math.random() * 0.38 : 0.6 + Math.random() * 0.4;
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
  const sparkles = new Float32Array(count);
  const clusterOrigins = new Float32Array(count * 3);
  const swirls = new Float32Array(count);
  const clusterPhases = new Float32Array(count);

  const clusterCount = count > 5000 ? 40 : 22;
  const clusters = Array.from({ length: clusterCount }, (_, clusterIndex) => {
    const angle = (clusterIndex / clusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.42;
    const radius = 0.4 + Math.pow(Math.random(), 0.72) * 5.3;
    const speed = 0.65 + Math.random() * 1.55;
    return {
      origin: new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.7,
        -4.5 - Math.random() * 7,
      ),
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.68,
        0.35 + Math.random() * 0.9,
      ),
      delay: Math.random() * 0.18,
      swirl: (Math.random() < 0.5 ? -1 : 1) * (1.25 + Math.random() * 2.55),
      phase: Math.random() * Math.PI * 2,
    };
  });

  for (let index = 0; index < count; index += 1) {
    const cluster = clusters[index % clusterCount];
    const localAngle = Math.random() * Math.PI * 2;
    const localRadius = Math.pow(Math.random(), 1.75) * (0.45 + Math.random() * 1.3);
    const offset = index * 3;
    positions[offset] = cluster.origin.x + Math.cos(localAngle) * localRadius;
    positions[offset + 1] = cluster.origin.y + Math.sin(localAngle) * localRadius * 0.72;
    positions[offset + 2] = cluster.origin.z + (Math.random() - 0.5) * 0.9;
    velocities[offset] = cluster.velocity.x + Math.cos(localAngle) * Math.random() * 0.42;
    velocities[offset + 1] = cluster.velocity.y + Math.sin(localAngle) * Math.random() * 0.36;
    velocities[offset + 2] = cluster.velocity.z + (Math.random() - 0.5) * 0.34;
    clusterOrigins[offset] = cluster.origin.x;
    clusterOrigins[offset + 1] = cluster.origin.y;
    clusterOrigins[offset + 2] = cluster.origin.z;
    delays[index] = cluster.delay + Math.random() * 0.12;
    lifetimes[index] = 4.2 + Math.random() * 1.8;
    const sparkle = Math.random() < 0.3;
    sizes[index] = sparkle
      ? 4.5 + Math.pow(Math.random(), 1.45) * 9
      : 1.8 + Math.pow(Math.random(), 1.55) * 3.2;
    brightness[index] = 0.7 + Math.random() * 0.3;
    turbulence[index] = 0.58 + Math.random() * 1.42;
    seeds[index] = Math.random();
    sparkles[index] = sparkle ? 0.72 + Math.random() * 0.28 : 0;
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
  geometry.setAttribute("aSparkle", new THREE.BufferAttribute(sparkles, 1));
  geometry.setAttribute("aClusterOrigin", new THREE.BufferAttribute(clusterOrigins, 3));
  geometry.setAttribute("aSwirl", new THREE.BufferAttribute(swirls, 1));
  geometry.setAttribute("aClusterPhase", new THREE.BufferAttribute(clusterPhases, 1));
  return geometry;
}

function createDeepSpaceWorld(isMobile: boolean) {
  const group = new THREE.Group();
  const fleet = new THREE.Group();
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

  const starCanvas = document.createElement("canvas");
  starCanvas.width = 32;
  starCanvas.height = 32;
  const starContext = starCanvas.getContext("2d");
  if (starContext) {
    const starGradient = starContext.createRadialGradient(16, 16, 0, 16, 16, 15);
    starGradient.addColorStop(0, "rgba(255,255,255,1)");
    starGradient.addColorStop(0.22, "rgba(236,249,255,0.96)");
    starGradient.addColorStop(0.58, "rgba(150,210,238,0.34)");
    starGradient.addColorStop(1, "rgba(100,180,220,0)");
    starContext.fillStyle = starGradient;
    starContext.fillRect(0, 0, 32, 32);
  }
  const starSprite = new THREE.CanvasTexture(starCanvas);
  starSprite.colorSpace = THREE.SRGBColorSpace;
  starSprite.generateMipmaps = true;
  textures.push(starSprite);

  const starCount = isMobile ? 850 : 1450;
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
    size: isMobile ? 0.18 : 0.14,
    sizeAttenuation: true,
    vertexColors: true,
    map: starSprite,
    alphaTest: 0.035,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  group.add(new THREE.Points(starGeometry, starMaterial));

  const planetTexture = new THREE.TextureLoader().load(`${BASE_PATH}/textures/bv-alien-planet.webp`);
  planetTexture.colorSpace = THREE.SRGBColorSpace;
  planetTexture.wrapS = THREE.RepeatWrapping;
  planetTexture.anisotropy = 4;
  textures.push(planetTexture);
  const planetMaterial = trackMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: planetTexture,
    roughness: 0.88,
    metalness: 0.02,
  }));
  const planetGeometry = trackGeometry(new THREE.SphereGeometry(12.8, isMobile ? 40 : 64, isMobile ? 24 : 40));
  const planet = new THREE.Mesh(planetGeometry, planetMaterial);
  planet.position.set(10.5, 0.8, -43);
  planet.rotation.set(-0.08, -1.12, 0.04);
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

  const flagship = createShip(1.05, new THREE.Vector3(-2.8, -0.8, -20), 0.18);
  createShip(0.34, new THREE.Vector3(5.8, 4.2, -31), -0.2);
  createShip(0.27, new THREE.Vector3(15.8, -3.8, -37), 0.28);
  createShip(0.2, new THREE.Vector3(-9.2, 3.4, -29), 0.08);
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

  const ringGeometry = trackGeometry(new THREE.TorusGeometry(14.5, 0.022, 4, 128));
  const ringMaterial = trackMaterial(new THREE.MeshBasicMaterial({
    color: 0x44cad1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const orbitalRing = new THREE.Mesh(ringGeometry, ringMaterial);
  orbitalRing.position.copy(planet.position);
  orbitalRing.rotation.set(0, 0, 0.12);
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
    starMaterial.opacity = eased * 0.72;
  };

  const cancelAssetLoad = () => {
    assetLoadCancelled = true;
  };

  return { group, fleet, flagship, planet, orbitalRing, interfaceAnchor, geometries, materials, textures, setOpacity, cancelAssetLoad };
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasSeenJump = Boolean(window.sessionStorage.getItem(SEEN_KEY));
    const storedMuted = window.localStorage.getItem("black-vector-audio-muted") === "true";
    const audio = new HyperspaceAudio(storedMuted);
    audioRef.current = audio;
    audio.prepare();
    const readinessTimer = window.setTimeout(() => {
      setNeedsEngagement(!hasSeenJump && !reducedMotion);
      setExperienceReady(hasSeenJump || reducedMotion);
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldJump = runId > 0 || (!window.sessionStorage.getItem(SEEN_KEY) && !reducedMotion);
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
    renderer.toneMappingExposure = 0.98;

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
    const exitWakeGeometry = createExitWakeGeometry(isMobile ? 230 : 420);
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
    exitWake.visible = false;
    scene.add(exitWake);

    const exitCrystalUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const exitCrystalGeometry = createExitCrystalGeometry(isMobile ? 650 : 1350);
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
    exitCrystals.visible = shouldJump;
    scene.add(exitCrystals);

    const exitDustUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const exitDustGeometry = createExitDustGeometry(isMobile ? 3400 : 8000);
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
    world.setOpacity(shouldJump ? 0 : 1);
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
      const pixelRatio = Math.min(window.devicePixelRatio || 1, largeFrame ? 1.25 : isMobile ? 1.35 : 1.6);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
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
        const charge = smoothstep(progress / 0.35);
        const launchProgress = clamp01((progress - 0.285) / 0.028);
        const launch = 1 - Math.pow(1 - launchProgress, 4);
        const visualLaunch = smoothstep((progress - 0.285) / 0.055);
        const braking = smoothstep((progress - 0.84) / 0.055);
        const exitArrival = smoothstep((progress - 0.89) / 0.11);
        const lineGrowth = smoothstep((progress - 0.04) / 0.31);
        const preLaunchSpeed = 0;
        const hyperspaceSpeed = 92;
        const speed = THREE.MathUtils.lerp(preLaunchSpeed, hyperspaceSpeed, launch) * (1 - braking) + 0.35 * braking;
        travel += speed * delta;
        uniforms.uTravel.value = travel;
        tunnelDustUniforms.uTravel.value = travel;
        tunnelDustUniforms.uOpacity.value = (0.025 + charge * 0.04 + visualLaunch * 0.42) * (1 - braking);
        warpBubbleUniforms.uTime.value = elapsed * 0.001;
        warpBubbleUniforms.uTravel.value = travel;
        warpBubbleUniforms.uOpacity.value = (charge * 0.008 + visualLaunch * 0.15) * (1 - braking);
        const stretchCharge = Math.pow(lineGrowth, 0.7);
        const staticStretch = THREE.MathUtils.lerp(0.035, 0.43, stretchCharge);
        uniforms.uForwardStretch.value = staticStretch * (1 - braking) + braking * 0.01;
        uniforms.uBackwardStretch.value = (staticStretch + visualLaunch * 0.89) * (1 - braking) + braking * 0.03;
        uniforms.uWidthScale.value = (0.76 + charge * 0.4 + visualLaunch * 0.38) * (1 - braking * 0.35);
        uniforms.uEnergy.value = (0.24 + charge * 0.88 + visualLaunch * 0.34) * (1 - braking * 0.48);
        uniforms.uSymmetry.value = 1 - visualLaunch;
        uniforms.uOpacity.value = smoothstep(progress / 0.015) * (0.24 + charge * 0.76) * (1 - smoothstep((progress - 0.88) / 0.055));
        exitWakeUniforms.uTime.value = 0;
        exitWakeUniforms.uOpacity.value = 0;
        exitCrystalUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.91) / 1000);
        exitCrystalUniforms.uOpacity.value = smoothstep((progress - 0.9) / 0.035);
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.91) / 1000);
        exitDustUniforms.uOpacity.value = smoothstep((progress - 0.905) / 0.025) * 1.25;
        world.setOpacity(smoothstep((progress - 0.865) / 0.09));
        renderer.toneMappingExposure = 0.94 + charge * 0.1 + launch * 0.06;

        const launchShake = smoothstep((progress - 0.285) / 0.012) * (1 - smoothstep((progress - 0.36) / 0.055));
        const brakingShake = smoothstep((progress - 0.82) / 0.05) * (1 - smoothstep((progress - 0.965) / 0.035));
        const cruiseShake = launch * (1 - braking) * 0.006;
        const shakeStrength = launchShake * 0.065 + brakingShake * 0.032 + cruiseShake;
        const launchRecoil = launch * (1 - smoothstep((progress - 0.285) / 0.08));
        camera.position.x = Math.sin(elapsed * 0.031) * shakeStrength;
        camera.position.y = Math.cos(elapsed * 0.027) * shakeStrength * 0.68;
        camera.position.z = -0.9 * exitArrival + launchRecoil * 0.32 + Math.sin(elapsed * 0.019) * shakeStrength * 0.32;
        cameraTarget.set(
          4.8 * exitArrival + Math.sin(elapsed * 0.024) * shakeStrength * 0.72,
          -0.2 * exitArrival + Math.cos(elapsed * 0.021) * shakeStrength * 0.46,
          THREE.MathUtils.lerp(-100, -38, exitArrival),
        );
        camera.lookAt(cameraTarget);
        camera.rotation.z += Math.sin(elapsed * 0.023) * shakeStrength * 0.028;
        camera.fov = 62 + charge * 4 + launch * 20 - braking * 22;
        camera.updateProjectionMatrix();

        if (progress >= 1) {
          jumpComplete = true;
          landingStartTime = time;
          tunnel.visible = false;
          tunnelDust.visible = false;
          warpBubble.visible = false;
          world.setOpacity(1);
          renderer.toneMappingExposure = 0.98;
          if (!finishQueued) {
            finishQueued = true;
            finish();
          }
        }
      } else {
        const landingElapsed = landingStartTime === null ? 1600 : Math.max(0, time - landingStartTime);
        const wakeFade = 1 - smoothstep(landingElapsed / 2100);
        const dustFade = 1 - smoothstep(landingElapsed / 3400);
        exitWakeUniforms.uTime.value = 0;
        exitWakeUniforms.uOpacity.value = 0;
        exitCrystalUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.91) / 1000);
        exitCrystalUniforms.uOpacity.value = wakeFade;
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.91) / 1000);
        exitDustUniforms.uOpacity.value = dustFade * 1.2;
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
          4.8 - scrollProgress * 6.8,
          -0.2 + scrollProgress * 0.6,
          -38 - scrollProgress * 12,
        );
        cameraTarget.lerp(desiredTarget, cameraDamping);
        camera.lookAt(cameraTarget);
        camera.fov = THREE.MathUtils.lerp(camera.fov, 64 - scrollProgress * 2, cameraDamping);
        camera.updateProjectionMatrix();

        world.fleet.rotation.y = Math.sin(elapsed * 0.00008) * 0.022;
        world.flagship.position.y = -0.9 + Math.sin(elapsed * 0.00034) * 0.08;
        world.planet.rotation.y = -1.12 + elapsed * 0.000008;
        world.orbitalRing.rotation.z = 0.12 + elapsed * 0.000018;
      }

      const currentInterfaceArrival = jumpComplete && landingStartTime !== null
        ? smoothstep((time - landingStartTime - 100) / 1450)
        : jumpComplete ? 1 : 0;
      updateWorldAnchors(currentInterfaceArrival);
      renderer.render(scene, camera);
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
