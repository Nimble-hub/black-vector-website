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
const EXIT_SETTLE_DURATION = 3000;
const LAUNCH_PROGRESS = 0.35;
const DEPTH = 132;
const NEAR = 0.68;
const SCENE_EXPOSURE = 1.18;
const SCENE_RIM_BASE = 48;
const EXIT_RIM_BOOST = 86;
const SEEN_KEY = "black-vector-jump-seen-3d-v23";
const AUDIO_VOLUME_KEY = "black-vector-audio-volume";
const AUDIO_SYNC_EVENT = "black-vector-audio-sync";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CRUISE_PULSE_STARTS = [0.47, 0.62, 0.75] as const;

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
  uniform float uFormation;
  uniform float uPressurePulse;
  uniform float uPressurePhase;
  uniform vec2 uResolution;

  varying vec2 vRibbonUv;
  varying float vBrightness;
  varying float vHue;
  varying float vDepthFade;
  varying float vFormationMask;

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
    float pulseCenter = mix(
      0.04,
      1.08,
      pow(clamp(uPressurePhase, 0.0, 1.0), 0.68)
    );
    float pulseDistance = (normalizedDepth - pulseCenter) / 0.075;
    float pressureShell = exp(-pulseDistance * pulseDistance);
    float radialScale = 1.0
      + tensionCurve * 0.16
      + uWarpRelease * (shell * 0.22 + shellSlope * 0.055)
      + cruiseWave
      + uPressurePulse * pressureShell * 0.085;
    float aperture = mix(
      0.82,
      1.0,
      pow(clamp(uFormation, 0.0, 1.0), 0.72)
    );
    radialScale *= aperture;

    float anchorZ = min(
      -uDepth + travel + uWarpRelease * shellSlope * 3.2,
      -uNear
    );
    float headZ = min(anchorZ + aLength * uForwardStretch, -uNear);
    float tailZ = anchorZ - aLength * uBackwardStretch;
    float headDepth = clamp(
      normalizedDepth + (aLength * uForwardStretch) / uDepth,
      0.0,
      1.0
    );
    float tailDepth = clamp(
      normalizedDepth - (aLength * uBackwardStretch) / uDepth,
      0.0,
      1.0
    );
    float headWake = mix(
      0.42,
      1.28,
      pow(smoothstep(0.0, 0.86, headDepth), 0.3)
    );
    float tailWake = mix(
      0.34,
      1.28,
      pow(smoothstep(0.0, 0.86, tailDepth), 0.3)
    );
    vec2 radialDirection = vec2(cos(aAngle), sin(aAngle));
    vec2 bubbleEllipse = vec2(1.34, 0.78);
    vec2 tailRadial = radialDirection
      * bubbleEllipse
      * aRadius
      * radialScale
      * tailWake;
    vec2 headRadial = radialDirection
      * bubbleEllipse
      * aRadius
      * radialScale
      * headWake;

    vec4 clipTail = projectionMatrix * modelViewMatrix * vec4(tailRadial, tailZ, 1.0);
    vec4 clipHead = projectionMatrix * modelViewMatrix * vec4(headRadial, headZ, 1.0);
    vec2 ndcTail = clipTail.xy / clipTail.w;
    vec2 ndcHead = clipHead.xy / clipHead.w;
    vec2 screenTail = ndcTail * uResolution * 0.5;
    vec2 screenHead = ndcHead * uResolution * 0.5;
    vec2 direction = normalize(screenHead - screenTail + vec2(0.00001));
    vec2 perpendicular = vec2(direction.y, -direction.x);
    float perspectiveWidth = clamp(22.0 / max(clipHead.w, 0.5), 0.8, 5.5);
    float halfWidth = max(aWidth * uWidthScale * perspectiveWidth, 1.65);

    float along = uv.y;
    float pointDepth = mix(tailDepth, headDepth, along);
    float pointWake = mix(
      0.38,
      1.28,
      pow(smoothstep(0.0, 0.86, pointDepth), 0.3)
    );
    float wakeCurl = (1.0 - pointDepth)
      * (0.068 + uWarpRelease * 0.115 + uWarpCruise * 0.058)
      * sin(aAngle * 3.1 + uTravel * 0.012);
    float pointAngle = aAngle + wakeCurl;
    vec2 pointRadial = vec2(cos(pointAngle), sin(pointAngle))
      * bubbleEllipse
      * aRadius
      * radialScale
      * pointWake;
    // Bow each segmented ribbon gently across the tunnel wall. The endpoints
    // remain anchored while the middle follows the barrel, which keeps the
    // speed lines sharp but gives the volume a visibly curved cross-section.
    float tubeBow = sin(along * 3.14159265)
      * (0.014 + uWarpRelease * 0.022 + uWarpCruise * 0.018);
    pointRadial *= 1.0 + tubeBow;
    float pointZ = mix(tailZ, headZ, along);
    vec4 clipPoint = projectionMatrix * modelViewMatrix * vec4(pointRadial, pointZ, 1.0);
    vec2 screenPosition = (clipPoint.xy / clipPoint.w) * uResolution * 0.5;
    screenPosition += perpendicular * uv.x * halfWidth;
    vec2 ndcPosition = screenPosition / (uResolution * 0.5);
    float apertureRadius = mix(
      0.28,
      1.55,
      pow(clamp(uFormation, 0.0, 1.0), 0.68)
    );
    float apertureSoftness = mix(0.1, 0.22, uFormation);
    float screenRadius = length(ndcPosition * vec2(0.9, 1.08));
    float tunnelAperture = 1.0 - smoothstep(
      apertureRadius - apertureSoftness,
      apertureRadius,
      screenRadius
    );
    // Before the aperture opens these same short ribbons read as a dense,
    // full-frame star field. The field then hands off to the expanding wake.
    float preWarpStarField = (1.0 - smoothstep(0.0, 0.72, uFormation)) * 0.74;
    // Hold full coverage on the horizontal and vertical edges while allowing
    // only the far corners to roll away. A slight wall bias makes the viewer
    // read a continuous cylindrical shell rather than a filled rectangle.
    float curvedWall = mix(0.95, 1.0, smoothstep(0.42, 1.04, screenRadius));
    vFormationMask = max(tunnelAperture, preWarpStarField) * curvedWall;
    float clipW = clipPoint.w;
    float ndcZ = clipPoint.z / clipPoint.w;

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
  varying float vFormationMask;

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
    float alpha = profile
      * longitudinal
      * vDepthFade
      * vFormationMask
      * uOpacity;

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
  attribute float aGlint;
  attribute float aFlyby;

  uniform float uTravel;
  uniform float uDepth;
  uniform float uOpacity;
  uniform float uWarpTension;
  uniform float uWarpRelease;
  uniform float uWarpPhase;
  uniform float uWarpCruise;
  uniform float uLaunchDust;
  uniform float uFormation;
  uniform float uPressurePulse;
  uniform float uPressurePhase;

  varying float vBrightness;
  varying float vLife;
  varying float vGlint;
  varying float vFlyby;
  varying vec4 vDustDynamics;

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
    float pulseCenter = mix(
      0.04,
      1.08,
      pow(clamp(uPressurePhase, 0.0, 1.0), 0.68)
    );
    float pulseDistance = (normalizedDepth - pulseCenter) / 0.075;
    float pressureShell = exp(-pulseDistance * pulseDistance);
    float radialScale = 1.0
      + uWarpTension * throatField * 0.16
      + uWarpRelease * (shell * 0.22 + shellSlope * 0.055)
      + cruiseWave
      + uPressurePulse * pressureShell * 0.085;
    float aperture = mix(
      0.82,
      1.0,
      pow(clamp(uFormation, 0.0, 1.0), 0.72)
    );
    float wakeSurface = mix(
      0.36,
      1.28,
      pow(smoothstep(0.0, 0.86, normalizedDepth), 0.32)
    );
    radialScale *= aperture * wakeSurface;
    float wakeGather = uLaunchDust * (0.22 + shell * 0.34);
    radialScale *= 1.0 - wakeGather;
    float z = -uDepth
      + travel
      + uWarpRelease * shellSlope * 3.2
      + uLaunchDust * shellSlope * 1.4;
    vec2 radial = vec2(cos(aAngle), sin(aAngle))
      * vec2(1.34, 0.78)
      * aRadius
      * radialScale;
    vec4 viewPosition = modelViewMatrix * vec4(radial, z, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float launchScale = 1.0 + uLaunchDust * (0.18 + shell * 0.65);
    float nearCamera = smoothstep(0.72, 0.985, normalizedDepth);
    float flybyPresence = aFlyby * uWarpCruise * nearCamera;
    float pointLimit = mix(mix(3.6, 6.2, aGlint), 17.0, flybyPresence);
    gl_PointSize = clamp(
      aSize
        * launchScale
        * (1.0 + flybyPresence * 6.0)
        * (18.0 / max(-viewPosition.z, 1.0)),
      0.45,
      pointLimit
    );

    vBrightness = aBrightness;
    vLife = smoothstep(0.0, 12.0, travel)
      * (1.0 - smoothstep(uDepth - 5.0, uDepth, travel));
    vec2 dustNdc = gl_Position.xy / max(gl_Position.w, 0.0001);
    float apertureRadius = mix(
      0.28,
      1.55,
      pow(clamp(uFormation, 0.0, 1.0), 0.68)
    );
    float apertureSoftness = mix(0.1, 0.22, uFormation);
    float dustAperture = 1.0 - smoothstep(
      apertureRadius - apertureSoftness,
      apertureRadius,
      length(dustNdc * vec2(0.9, 1.08))
    );
    float preWarpDustField = (1.0 - smoothstep(0.0, 0.74, uFormation)) * 0.82;
    vLife *= max(dustAperture, preWarpDustField);
    vLife *= uOpacity;
    vGlint = aGlint;
    vFlyby = flybyPresence;
    vDustDynamics = vec4(uLaunchDust, shell, aAngle, normalizedDepth);
  }
`;

const tunnelDustFragmentShader = `
  precision highp float;

  varying float vBrightness;
  varying float vLife;
  varying float vGlint;
  varying float vFlyby;
  varying vec4 vDustDynamics;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceFromCenter = length(point);
    float crystalAngle = vDustDynamics.z * 1.6180339;
    float crystalCos = cos(crystalAngle);
    float crystalSin = sin(crystalAngle);
    vec2 crystalPoint = mat2(
      crystalCos,
      -crystalSin,
      crystalSin,
      crystalCos
    ) * point;
    float diamondDistance = abs(crystalPoint.x) + abs(crystalPoint.y);
    float diamond = 1.0 - smoothstep(0.16, 0.49, diamondDistance);
    float facet = 1.0 - smoothstep(0.02, 0.25, diamondDistance);
    float core = 1.0 - smoothstep(0.0, 0.105, distanceFromCenter);
    float launchSpark = vDustDynamics.x * (0.34 + vDustDynamics.y * 0.66);
    float wakeTransit = smoothstep(0.12, 0.82, vDustDynamics.w);
    float nearFlyby = vFlyby * smoothstep(0.68, 0.98, vDustDynamics.w);
    float glintEnergy = 0.12
      + launchSpark * 0.72
      + wakeTransit * 0.12
      + vGlint * 0.42
      + nearFlyby * 0.92;
    vec2 radialAxis = vec2(cos(vDustDynamics.z), sin(vDustDynamics.z));
    vec2 tangentAxis = vec2(-radialAxis.y, radialAxis.x);
    float along = abs(dot(point, radialAxis));
    float across = abs(dot(point, tangentAxis));
    float microStreak = (1.0 - smoothstep(0.1, 0.5, along))
      * (1.0 - smoothstep(0.025, 0.11, across))
      * clamp(
        launchSpark * 0.58 + wakeTransit * 0.86 + nearFlyby * 1.4,
        0.0,
        1.0
      );
    float horizontalRay = 1.0 - smoothstep(0.018, 0.075, abs(point.y));
    float verticalRay = 1.0 - smoothstep(0.018, 0.075, abs(point.x));
    float rayFade = 1.0 - smoothstep(0.06, 0.5, distanceFromCenter);
    float diffraction = max(horizontalRay, verticalRay * 0.7)
      * rayFade
      * glintEnergy
      * (1.0 + nearFlyby * 0.75);
    vec3 ice = mix(vec3(0.34, 0.7, 1.0), vec3(0.97, 0.995, 1.0), core);
    float diffractionAlpha = diffraction * (0.24 + vGlint * 0.48);
    float diamondPresence = 1.0 - wakeTransit * 0.56;
    float alpha = max(
      max(diamond * diamondPresence, diffractionAlpha),
      microStreak * 0.72
    )
      * vLife
      * vBrightness
      * (1.0 + launchSpark * 0.42 + nearFlyby * 0.7);
    gl_FragColor = vec4(
      ice * (
        0.78
        + facet * 0.62
        + core * 0.55
        + launchSpark * 0.38
        + diffraction * (1.05 + vGlint * 0.7)
        + microStreak * 0.92
      ),
      alpha
    );
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
    float axialEnvelope = pow(max(sin(depth * 3.14159265), 0.0), 0.29);
    // A broad barrel with rounded shoulders makes the field curve around the
    // camera instead of terminating in a pointed radial-burst silhouette.
    float bubbleScale = mix(0.72, 1.16, axialEnvelope);
    bubbleScale *= 1.0 - uCompression * 0.035 + uRelease * 0.055;
    vec2 bubbleCrossSection = vec2(1.28, 0.82);
    displacedPosition.xy *= bubbleScale;
    displacedPosition.xy *= bubbleCrossSection;
    displacedPosition.xy += radial * bubbleCrossSection * (
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
    uMotionBlur: { value: 0 },
    uSceneWarp: { value: 0 },
    uBowWave: { value: 0 },
    uBowPhase: { value: 0 },
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
    uniform float uMotionBlur;
    uniform float uSceneWarp;
    uniform float uBowWave;
    uniform float uBowPhase;
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
      float ringWidth = max(horizon * 0.3, 0.019);
      float photonRing = exp(-pow(signedDistance / ringWidth, 2.0) * 2.6);
      float innerDistance = signedDistance + ringWidth * 0.78;
      float outerDistance = signedDistance - ringWidth * 1.18;
      float innerSkin = exp(-pow(innerDistance / (ringWidth * 0.72), 2.0) * 2.1);
      float outerSkin = exp(-pow(outerDistance / (ringWidth * 1.16), 2.0) * 1.85);
      float shellStack = photonRing + innerSkin * 0.48 + outerSkin * 0.34;
      // A stable bow wave loads in front of the ship and then rolls around the
      // camera at ignition. It is a clean compression threshold—no fractures
      // or tearing—so the drive reads as controlled technology.
      float bowRadius = mix(
        shapedHorizon * 0.76,
        1.22,
        pow(clamp(uBowPhase, 0.0, 1.0), 0.62)
      );
      float bowWidth = mix(0.024, 0.085, uBowPhase);
      float bowDistance = (radius - bowRadius) / max(bowWidth, 0.001);
      float bowFront = exp(-bowDistance * bowDistance * 2.1) * uBowWave;
      float outerField = 1.0 - smoothstep(horizon * 0.96, horizon * 3.85, radius);
      float wideField = 1.0 - smoothstep(
        horizon * 1.05,
        max(horizon * 6.4, 1.05),
        radius
      );
      float innerGuard = smoothstep(horizon * 0.22, horizon * 0.78, radius);
      float falloff = (horizon * horizon) /
        max(radius * radius + horizon * horizon * 0.3, 0.0001);
      float shellFold = (-signedDistance / max(ringWidth, 0.001)) * photonRing
        + (-innerDistance / max(ringWidth, 0.001)) * innerSkin * 0.42
        + (-outerDistance / max(ringWidth, 0.001)) * outerSkin * 0.28;
      float deflection = uStrength * outerField * innerGuard * falloff * 0.082
        + shellFold * uStrength * (0.0125 + uCruise * 0.0042)
        + uFlash * outerField * innerGuard * falloff * 0.035
        + bowFront * (0.012 + (1.0 - uBowPhase) * 0.01)
        + uStrength * wideField * innerGuard
          * (0.0055 + uFlash * 0.016 + uCruise * 0.0018);
      vec2 uvMin = vec2(0.001);
      vec2 uvMax = vec2(0.999);
      float orbitalShear = (
        sin(angle * 3.0 + uTime * 0.34)
          + sin(angle * 5.0 - uTime * 0.19) * 0.38
      ) * shellStack * uStrength * (0.0011 + uCruise * 0.00075);
      float pressureShear = sin(angle * 2.0 - uTime * 0.22)
        * wideField
        * uStrength
        * (0.0007 + uFlash * 0.0028);
      // The central horizon supplies the focal event, while this broader
      // optical compression carries the same pressure through the full star
      // wall. Sampling inward keeps the frame filled and avoids rectangular
      // clamping smears at the display edges.
      float frameReach = smoothstep(
        horizon * 0.4,
        max(horizon * 1.35, 0.2),
        radius
      );
      float frameCurve = pow(clamp(radius / 1.08, 0.0, 1.0), 1.25);
      float sceneCompression = uSceneWarp
        * frameReach
        * (0.003 + frameCurve * 0.011);
      float sceneShear = sin(angle * 2.0 - uTime * 0.18)
        * uSceneWarp
        * frameReach
        * (0.0007 + frameCurve * 0.0012);
      vec2 warpedUv = clamp(
        vUv
          + radialUv * (deflection - sceneCompression)
          + tangentUv * (orbitalShear + pressureShear + sceneShear),
        uvMin,
        uvMax
      );

      vec2 skinSeparation = radialUv
        * shellStack
        * uStrength
        * (0.0032 + uCruise * 0.0018);

      float localStretch = outerField
        * smoothstep(horizon * 0.32, horizon * 2.65, radius);
      float wideStretch = wideField
        * smoothstep(horizon * 1.2, horizon * 5.4, radius)
        * (0.16 + uFlash * 0.5 + uCruise * 0.1);
      float stretchMask = max(localStretch, wideStretch);
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
      float stretchBlend = clamp(uStretch * 9.0, 0.0, 0.94) * stretchMask;
      vec3 lensed = mix(warped, streak, stretchBlend);

      // A short radial shutter trail connects the optical collapse to forward
      // acceleration. Sampling only outward from the vanishing point makes
      // the image feel pulled past the camera rather than generally softened.
      // uMotionBlur is zero through cruise, so this uniform branch avoids five
      // full-resolution texture reads for the majority of the experience.
      if (uMotionBlur > 0.02) {
        vec2 shutterStep = radialUv * uMotionBlur * 0.0048;
        vec3 shutterTrail = lensed * 0.34;
        shutterTrail += texture2D(tDiffuse, clamp(warpedUv + shutterStep, uvMin, uvMax)).rgb * 0.25;
        shutterTrail += texture2D(tDiffuse, clamp(warpedUv + shutterStep * 2.15, uvMin, uvMax)).rgb * 0.19;
        shutterTrail += texture2D(tDiffuse, clamp(warpedUv + shutterStep * 3.55, uvMin, uvMax)).rgb * 0.13;
        shutterTrail += texture2D(tDiffuse, clamp(warpedUv + shutterStep * 5.1, uvMin, uvMax)).rgb * 0.09;
        float shutterMask = max(outerField * 0.72, wideField * 0.46)
          * smoothstep(horizon * 0.5, horizon * 4.8, radius);
        lensed = mix(
          lensed,
          shutterTrail,
          clamp(uMotionBlur * shutterMask * 0.72, 0.0, 0.68)
        );
      }

      float fieldBlend = max(
        max(outerField, bowFront * 0.82),
        max(
          wideField * (0.2 + uFlash * 0.48 + uCruise * 0.12),
          uSceneWarp * frameReach * (0.44 + frameCurve * 0.24)
        )
      );
      float chroma = (shellStack * uStrength * 0.00145 + uStretch * 0.0034)
        * fieldBlend
        + uSceneWarp * frameReach * (0.00018 + frameCurve * 0.00022);
      lensed.r = texture2D(tDiffuse, clamp(warpedUv - radialUv * chroma, uvMin, uvMax)).r;
      lensed.b = texture2D(tDiffuse, clamp(warpedUv + radialUv * chroma, uvMin, uvMax)).b;
      float compressedLight = max(sceneLuma(lensed) - sceneLuma(base), 0.0);
      float horizontalFlare = exp(-abs(centered.y) / (0.004 + uFlash * 0.004))
        * exp(-radius * 4.6) * uFlash;
      vec3 ringLight = vec3(0.68, 0.88, 1.0)
        * (photonRing + innerSkin * 0.22 + outerSkin * 0.14)
        * (0.024 + compressedLight * 0.42) * uStrength;
      vec3 launchLight = vec3(0.74, 0.9, 1.0)
        * (
          photonRing * 0.12
          + horizontalFlare * 0.075
          + bowFront * (0.07 + uFlash * 0.055)
        )
        * max(uFlash, uBowWave * 0.58);
      float core = (1.0 - smoothstep(horizon * 0.28, horizon * 0.86, radius))
        * uDarkness;
      vec3 color = mix(base, lensed, fieldBlend);
      color += ringLight + launchLight;
      color *= 1.0 - core * 0.68;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};


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
      * (1.15 + aTurbulence * 1.45);
    clusterOrbit *= 1.0
      + shockRise * (0.18 + aTurbulence * 0.1)
      + age * (0.035 + aTurbulence * 0.018);
    vec2 radialDirection = normalize(clusterOrbit + vec2(0.0001));
    vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);

    // A few broad, continuous wind fields carry the perimeter veil as one
    // sheet. The seed only adds fine breakup, so grains curl in wisps instead
    // of vibrating as unrelated clumps.
    float curlEnvelope = smoothstep(0.06, 0.72, age)
      * (1.0 - smoothstep(3.2, 5.4, age));
    float flowPhase = aClusterPhase * 0.72;
    float sharedCurl = sin(flowPhase + age * 1.34);
    float sharedRoll = cos(flowPhase * 0.61 - age * 0.86 + 0.9);
    float wakeFold = sin(flowPhase * 1.87 + age * 2.05) * 0.22;
    float microCurl = sin(age * (1.8 + aSeed * 0.64) + aSeed * 18.0) * 0.075;
    float gustPulse = 0.68 + 0.32 * sin(age * 0.9 + flowPhase * 0.55);
    float gustStrength = aTurbulence * curlEnvelope * gustPulse * (0.16 + age * 0.15);
    vec3 gust = vec3(
      tangentDirection * (sharedCurl * 0.78 + wakeFold * 0.24 + microCurl)
        + radialDirection * (sharedRoll * 0.18 + sharedCurl * sharedRoll * 0.07),
      (sharedCurl * sharedRoll + wakeFold * 0.35) * 0.14
    ) * gustStrength;

    float dragRate = aDrag;
    float retainedTravel = (1.0 - exp(-age * dragRate)) / dragRate;
    float forwardSpeed = 4.25 + aVelocity.z * 6.55;
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
    float primaryFlash = pow(
      max(sin(age * (3.15 + aSeed * 2.55) + aSeed * 43.0), 0.0),
      27.0
    ) * step(0.5, aSeed);
    float secondaryFlash = pow(
      max(cos(age * (5.1 + aSeed * 2.6) + aSeed * 97.0), 0.0),
      34.0
    ) * step(0.76, aSeed);
    float facetFlash = max(primaryFlash, secondaryFlash);
    float seededFlash = aGlint * pow(
      max(sin(age * (2.05 + aSeed * 1.55) + aSeed * 67.0), 0.0),
      28.0
    );
    float diamondFire = max(facetFlash, seededFlash);
    float effectiveGlint = max(diamondFire, headlightResponse * 0.42);
    gl_PointSize = clamp(
      aSize * (18.0 / max(-viewPosition.z, 1.0))
        * (1.0 + diamondFire * 1.55 + headlightResponse * 0.12),
      0.58,
      5.8
    );

    vLife = isAlive * fade * uOpacity;
    vBrightness = aBrightness * (
      0.8 + headlightResponse * 2.8 + diamondFire * 4.15
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

    // Keep the camera glint inside the crystal sprite. Long cross-shaped
    // diffraction read as blue/green streaks once thousands overlapped.
    float horizontalGlint = 1.0 - smoothstep(0.008, 0.038, abs(point.y));
    float verticalGlint = 1.0 - smoothstep(0.008, 0.038, abs(point.x));
    float glintFalloff = 1.0 - smoothstep(0.045, 0.19, diamondDistance);
    float compactGlint = max(horizontalGlint, verticalGlint * 0.82)
      * glintFalloff * max(vGlint, vFacetFlash);
    float pinFire = 1.0 - smoothstep(0.0, 0.075, diamondDistance);

    vec3 iceShadow = vec3(0.79, 0.815, 0.845);
    vec3 iceFacet = vec3(0.95, 0.97, 0.99);
    vec3 reflectedWhite = vec3(1.0, 0.998, 0.99);
    vec3 color = mix(iceShadow, iceFacet, 0.66 + facetLight * 0.3);
    color = mix(color, reflectedWhite, innerDiamond * 0.58 + facetSeam * 0.24);

    float bodyAlpha = crystalBody * (0.13 + innerDiamond * 0.1)
      * (1.0 - vFacetFlash * 0.84);
    float sparkleAlpha = max(compactGlint * 0.94, pinFire * vFacetFlash * 1.08);
    float alpha = max(
      bodyAlpha,
      sparkleAlpha
    ) * vLife * vBrightness;
    vec3 flashColor = reflectedWhite;
    vec3 emittedLight = flashColor * (
      pinFire * (1.8 + vFacetFlash * 10.4)
        + compactGlint * 5.1
        + crystalEdge * vGlint * 0.34
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
    // Hero stars used to draw identical cyan cross-rays. Against the exit
    // dust those repeated sprites read as patterned blue streaks, so keep the
    // glint photographic and radial instead.
    float compactGlint = (1.0 - smoothstep(0.025, 0.22, radius)) * vGlint;
    float haloWeight = mix(0.12, 0.27, vGlint);
    float alpha = max(core, halo * haloWeight + compactGlint * 0.18) * vStarAlpha;
    vec3 whiteCore = vec3(0.985, 0.997, 1.0);
    vec3 color = mix(vStarColor, whiteCore, core * 0.68 + compactGlint * 0.42);
    gl_FragColor = vec4(color * (0.72 + core * 1.65 + compactGlint * 0.74), alpha);
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

const stormCloudVertexShader = `
  precision highp float;

  uniform sampler2D uMap;
  uniform sampler2D uHeightMap;
  uniform float uTime;
  uniform float uLayer;
  uniform float uRelief;
  uniform vec2 uDrift;

  varying vec2 vStormUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vStormUv = uv;
    vec2 reliefUv = vec2(
      fract(uv.x + uDrift.x * uTime),
      clamp(uv.y + uDrift.y * sin(uTime * 0.07), 0.002, 0.998)
    );
    // Height comes from a deliberately low-frequency map. Fine albedo detail
    // stays in the fragment shader and can never turn into serrated geometry.
    vec3 reliefSample = texture2D(uHeightMap, reliefUv).rgb;
    float reliefLuminance = dot(reliefSample, vec3(0.2126, 0.7152, 0.0722));
    float layerHeight = clamp(uLayer, 0.0, 1.0);
    float reliefFloor = mix(0.26, 0.5, layerHeight);
    float reliefCeiling = mix(0.72, 0.9, layerHeight);
    float cloudRelief = smoothstep(reliefFloor, reliefCeiling, reliefLuminance);
    // The authored map already contains self-shadowed thunderhead relief. Keep
    // the geometric modulation broad so the clouds read as planetary masses,
    // not thousands of small animated puffs.
    cloudRelief *= 0.985 + sin(
      reliefUv.x * 7.0 + reliefUv.y * 5.0 + uTime * 0.018
    ) * 0.015;
    vec3 displacedPosition = position + normal * cloudRelief * uRelief;
    vec4 viewPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const stormCloudFragmentShader = `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLayer;
  uniform float uSteps;
  uniform float uShadowPass;
  uniform vec2 uDrift;
  uniform vec3 uSunDirection;

  varying vec2 vStormUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  float hash21(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float lightningFilament(vec2 uv, out float pulse) {
    vec2 gridUv = uv * vec2(36.0, 18.0);
    vec2 cell = floor(gridUv);
    vec2 local = fract(gridUv) - 0.5;
    float seed = hash21(cell);
    float activeCell = step(0.965, seed);
    pulse = pow(
      max(0.0, sin(uTime * (0.82 + seed * 0.24) + seed * 61.0)),
      96.0
    ) * activeCell;

    float mainPath = sin((local.y + seed) * 18.0 + seed * 8.0) * 0.09
      + sin((local.y - seed) * 41.0) * 0.026;
    float mainDistance = abs(local.x - mainPath);
    float mainCore = 1.0 - smoothstep(0.008, 0.026, mainDistance);
    float mainHalo = (1.0 - smoothstep(0.025, 0.09, mainDistance)) * 0.16;

    float branchAnchor = mix(-0.2, 0.12, hash21(cell + vec2(4.3, 8.7)));
    float branchDirection = mix(-0.72, 0.72, hash21(cell + vec2(9.1, 2.4)));
    float branchDistance = abs(
      local.x - mainPath - (local.y - branchAnchor) * branchDirection
    );
    float branchWindow = smoothstep(0.01, 0.08, local.y - branchAnchor)
      * (1.0 - smoothstep(0.2, 0.4, local.y - branchAnchor));
    float branchCore = (1.0 - smoothstep(0.008, 0.022, branchDistance))
      * branchWindow * 0.62;
    float envelope = smoothstep(0.5, 0.34, abs(local.y));
    return max(mainCore, branchCore) * envelope + mainHalo * envelope;
  }

  vec2 advectVortex(vec2 uv, vec2 center, float radius, float angularSpeed) {
    vec2 delta = uv - center;
    delta.x = fract(delta.x + 0.5) - 0.5;
    vec2 metricDelta = vec2(delta.x, delta.y * 1.92);
    float distanceFromEye = length(metricDelta);
    float influence = smoothstep(radius, radius * 0.12, distanceFromEye);
    float eyeWall = smoothstep(radius * 0.86, radius * 0.48, distanceFromEye)
      * smoothstep(radius * 0.08, radius * 0.31, distanceFromEye);
    float angle = uTime * angularSpeed * influence * (0.32 + eyeWall * 0.68);
    float cosine = cos(angle);
    float sine = sin(angle);
    metricDelta = mat2(cosine, -sine, sine, cosine) * metricDelta;
    delta = vec2(metricDelta.x, metricDelta.y / 1.92);
    return vec2(fract(center.x + delta.x), clamp(center.y + delta.y, 0.002, 0.998));
  }

  vec2 weatherAdvection(vec2 uv) {
    float altitudeShear = mix(1.0, -0.72, uLayer);
    float latitude = (uv.y - 0.5) * 2.0;
    uv.x = fract(
      uv.x
        + sin(latitude * 8.5 + uTime * 0.045) * 0.0038
        + sin(latitude * 17.0 - uTime * 0.028) * 0.0015
        + uTime * 0.000085 * latitude * altitudeShear
    );
    uv.y = clamp(
      uv.y + sin(uv.x * 18.0 + uTime * 0.035) * 0.0013 * (1.0 - abs(latitude) * 0.55),
      0.002,
      0.998
    );

    // Only the two continent-scale systems in the authored cloud map rotate.
    // Keeping the motion extremely slow preserves their mass and prevents the
    // surface from reading as small, turbulent texture noise.
    uv = advectVortex(uv, vec2(0.23, 0.49), 0.34, 0.0032 * altitudeShear);
    uv = advectVortex(uv, vec2(0.77, 0.47), 0.33, -0.003 * altitudeShear);
    return uv;
  }

  void main() {
    float layerHeight = clamp(uLayer, 0.0, 1.0);
    vec2 baseUv = weatherAdvection(vec2(
      fract(vStormUv.x + uDrift.x * uTime),
      clamp(vStormUv.y + uDrift.y * sin(uTime * 0.07), 0.002, 0.998)
    ));
    float grazing = pow(
      1.0 - clamp(dot(normalize(vViewNormal), normalize(vViewDirection)), 0.0, 1.0),
      1.55
    );
    vec2 parallaxDirection = normalize(vViewDirection.xy + vec2(0.0001));
    vec2 sunOffset = normalize(uSunDirection.xy + vec2(0.001)) * vec2(0.0055, 0.0038);
    float sunlight = clamp(dot(normalize(vWorldNormal), normalize(uSunDirection)), -0.15, 1.0);

    float transmittance = 1.0;
    float accumulatedAlpha = 0.0;
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedLightning = 0.0;

    for (int sampleIndex = 0; sampleIndex < 6; sampleIndex++) {
      if (float(sampleIndex) >= uSteps) break;
      float depth = (float(sampleIndex) + 0.5) / uSteps;
      float centeredDepth = depth - 0.5;
      vec2 sampleUv = baseUv
        + parallaxDirection * centeredDepth * grazing * (0.007 + uLayer * 0.004);
      sampleUv = vec2(fract(sampleUv.x), clamp(sampleUv.y, 0.002, 0.998));

      vec3 stormSample = texture2D(uMap, sampleUv).rgb;
      float luminance = dot(stormSample, vec3(0.2126, 0.7152, 0.0722));
      // Higher shells retain only the brightest thunderhead crowns while the
      // lower deck carries the broad spiral arms and global anvil bands.
      float cloudFloor = mix(0.24, 0.5, layerHeight);
      float cloudCeiling = mix(0.64, 0.88, layerHeight);
      float density = smoothstep(cloudFloor, cloudCeiling, luminance);
      float billow = 0.94 + 0.06 * sin(
        sampleUv.x * 17.0
          + sampleUv.y * 13.0
          + depth * 4.0
          + uTime * (0.025 + uLayer * 0.012)
      );
      density *= billow;
      // Dark texels contribute exactly zero. Avoid the second texture fetch,
      // self-shadow work, and procedural lightning for empty ocean/sky pixels.
      // This preserves the rendered result while substantially reducing the
      // cost of the sparse planetary cloud shells on software rasterizers.
      if (density <= 0.0) continue;
      float cloudCore = smoothstep(mix(0.36, 0.6, layerHeight), 0.92, luminance);

      vec3 shadowSample = texture2D(
        uMap,
        vec2(fract(sampleUv.x + sunOffset.x), clamp(sampleUv.y + sunOffset.y, 0.002, 0.998))
      ).rgb;
      float shadowLuminance = dot(shadowSample, vec3(0.2126, 0.7152, 0.0722));
      float shadowDensity = smoothstep(
        max(0.2, cloudFloor - 0.06),
        mix(0.64, 0.8, layerHeight),
        shadowLuminance
      );
      float selfShadow = mix(1.0, 0.28, shadowDensity * (0.34 + depth * 0.66));
      float sculptedLight = smoothstep(
        0.22,
        0.78,
        0.5 + (luminance - shadowLuminance) * 4.8
      );
      float stepAlpha = density * (1.08 / uSteps) * (0.78 + grazing * 0.88);
      float contribution = transmittance * stepAlpha;

      vec3 coldShadow = mix(vec3(0.16, 0.22, 0.3), vec3(0.28, 0.36, 0.47), layerHeight);
      vec3 sunlitSilver = mix(vec3(0.74, 0.82, 0.9), vec3(0.98, 1.03, 1.08), layerHeight);
      float silverMix = cloudCore
        * mix(0.3, 1.0, sculptedLight)
        * mix(0.68, 1.0, selfShadow);
      vec3 layerColor = mix(coldShadow, sunlitSilver, silverMix);
      layerColor *= 0.82 + max(sunlight, 0.0) * 0.78 + grazing * (0.34 + layerHeight * 0.24);
      layerColor *= mix(1.16, 0.68, depth);
      layerColor += vec3(0.19, 0.38, 0.48) * pow(grazing, 2.2) * density * (0.24 + layerHeight * 0.28);
      accumulatedColor += layerColor * contribution;
      accumulatedAlpha += contribution;

      float electricalPulse = 0.0;
      float filament = lightningFilament(sampleUv, electricalPulse);
      float embeddedLightning = filament
        * electricalPulse
        * smoothstep(0.34, 0.68, luminance)
        * (1.0 - smoothstep(0.94, 1.0, luminance))
        * mix(1.0, 0.18, layerHeight);
      accumulatedLightning += contribution * embeddedLightning * 3.4;
      transmittance *= 1.0 - stepAlpha;
    }

    vec3 cloudColor = accumulatedColor / max(accumulatedAlpha, 0.001);
    cloudColor += vec3(0.92, 0.97, 1.0) * accumulatedLightning;
    float alpha = clamp(accumulatedAlpha, 0.0, 0.96) * uOpacity;
    vec3 finalColor = mix(cloudColor, vec3(0.005, 0.012, 0.018), uShadowPass);
    float finalAlpha = alpha * mix(1.0, 0.56, uShadowPass);
    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

const atmosphereVertexShader = `
  precision highp float;

  varying vec3 vAtmosphereWorldPosition;
  varying vec3 vAtmosphereWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vAtmosphereWorldPosition = worldPosition.xyz;
    vAtmosphereWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  precision highp float;

  uniform float uOpacity;
  uniform float uInnerLayer;
  uniform vec3 uSunDirection;

  varying vec3 vAtmosphereWorldPosition;
  varying vec3 vAtmosphereWorldNormal;

  void main() {
    vec3 normalDirection = normalize(vAtmosphereWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vAtmosphereWorldPosition);
    vec3 sunDirection = normalize(uSunDirection);
    float viewNormal = abs(dot(normalDirection, viewDirection));
    float horizon = pow(1.0 - clamp(viewNormal, 0.0, 1.0), 2.15);
    float sunFacing = dot(normalDirection, sunDirection);
    float daylight = smoothstep(-0.18, 0.34, sunFacing);
    float forwardMie = pow(max(dot(viewDirection, sunDirection), 0.0), 18.0);
    float terminator = 1.0 - smoothstep(-0.08, 0.18, abs(sunFacing));

    vec3 nightRayleigh = vec3(0.025, 0.18, 0.3);
    vec3 dayRayleigh = vec3(0.18, 0.72, 0.92);
    vec3 rayleigh = mix(nightRayleigh, dayRayleigh, daylight);
    vec3 mie = vec3(0.72, 0.91, 1.0) * forwardMie;
    vec3 electricalTerminator = vec3(0.08, 0.46, 0.68) * terminator * 0.34;
    vec3 atmosphereColor = rayleigh * (0.58 + horizon * 0.86)
      + mie * 0.5
      + electricalTerminator;

    float outerAlpha = horizon * (0.26 + daylight * 0.5 + forwardMie * 0.3);
    float innerAlpha = (0.025 + horizon * 0.3) * (0.42 + daylight * 0.58);
    float alpha = mix(outerAlpha, innerAlpha, uInnerLayer) * uOpacity;
    gl_FragColor = vec4(atmosphereColor, alpha);
  }
`;

function createTunnelGeometry(count: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  const ribbonSegments = 7;
  const ribbonPositions: number[] = [];
  const ribbonUvs: number[] = [];
  const ribbonIndices: number[] = [];

  for (let segment = 0; segment <= ribbonSegments; segment += 1) {
    const along = segment / ribbonSegments;
    ribbonPositions.push(-1, along, 0, 1, along, 0);
    ribbonUvs.push(-1, along, 1, along);
  }

  for (let segment = 0; segment < ribbonSegments; segment += 1) {
    const row = segment * 2;
    ribbonIndices.push(row, row + 1, row + 3, row, row + 3, row + 2);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(ribbonPositions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(ribbonUvs, 2));
  geometry.setIndex(ribbonIndices);

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
  const glints = new Float32Array(count);
  const flybys = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const isSideDust = Math.random() < 0.68;
    const isCoreDust = !isSideDust && Math.random() < 0.42;
    const isHeroGlint = Math.random() < 0.07;
    angles[index] = Math.random() * Math.PI * 2;
    radii[index] = isSideDust ? 9.4 + Math.pow(Math.random(), 0.66) * 11.6 : isCoreDust ? 0.72 + Math.pow(Math.random(), 1.34) * 5.2 : 4.8 + Math.pow(Math.random(), 0.8) * 8.2;
    seeds[index] = Math.random() * DEPTH;
    sizes[index] = isHeroGlint ? 1.55 + Math.pow(Math.random(), 1.6) * 1.15 : (isCoreDust ? 0.56 : 0.48) + Math.pow(Math.random(), 2.2) * (isCoreDust ? 0.82 : 0.68);
    brightness[index] = isHeroGlint ? 0.9 + Math.random() * 0.1 : (isSideDust ? 0.58 : isCoreDust ? 0.66 : 0.46) + Math.random() * (isSideDust ? 0.36 : isCoreDust ? 0.28 : 0.38);
    glints[index] = isHeroGlint ? 1 : 0;
    // A small deterministic subset becomes near-lens hero particles. Their
    // depth still comes from the shared tunnel flow, so the flybys feel like
    // rare pieces of the same diamond dust rather than a separate overlay.
    flybys[index] = index % 157 === 0 ? 1 : 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute("aSeedZ", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
  geometry.setAttribute("aGlint", new THREE.BufferAttribute(glints, 1));
  geometry.setAttribute("aFlyby", new THREE.BufferAttribute(flybys, 1));
  return geometry;
}

function createWarpBubbleGeometry(isMobile: boolean) {
  const baseGeometry = new THREE.CylinderGeometry(19.6, 19.6, DEPTH, isMobile ? 32 : 56, isMobile ? 36 : 64, true);
  baseGeometry.rotateX(Math.PI / 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(baseGeometry.index);
  for (const [name, attribute] of Object.entries(baseGeometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  for (const group of baseGeometry.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  const layers = isMobile ? new Float32Array([-0.68, 0.68]) : new Float32Array([-1, 0, 1]);
  geometry.setAttribute("aLayer", new THREE.InstancedBufferAttribute(layers, 1));
  geometry.instanceCount = layers.length;
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
    const shellOffset = shellChoice < 0.68 ? (Math.random() - 0.5) * 1.1 : shellChoice < 0.9 ? 0.8 + Math.random() * 1.6 : -1.5 + Math.random() * 0.9;
    const ringRadius = 5.9 + broadLobe + fineLobe + shellOffset;
    const originX = Math.cos(angle) * ringRadius;
    const originY = Math.sin(angle) * ringRadius * 0.72 - 0.16;
    const originZ = 1.15 + Math.pow(Math.random(), 1.3) * 7.4 + (0.5 + 0.5 * Math.sin(angle * 2 - 0.7)) * 0.8;
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle) * 0.72;
    const radialX = Math.cos(angle);
    const radialY = Math.sin(angle) * 0.72;
    const along = (Math.random() - 0.5) * (0.62 + Math.pow(Math.random(), 1.55) * 1.65);
    const across = (Math.random() - 0.5) * (0.28 + Math.random() * 0.82);
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
    const releaseWave = (0.5 + 0.5 * Math.sin(angle * 3.0 - 0.4)) * 0.018;
    delays[index] = 0.006 + Math.pow(Math.random(), 1.45) * 0.12 + releaseWave;
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

function createDeepSpaceWorld(isMobile: boolean, balancedQuality: boolean, softwareRendering: boolean) {
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
  const criticalAssetLoads: Promise<void>[] = [];
  const textureLoader = new THREE.TextureLoader();

  const loadCriticalTexture = (path: string) => {
    let settleLoad: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      settleLoad = resolve;
    });
    const texture = textureLoader.load(path, settleLoad, undefined, settleLoad);
    criticalAssetLoads.push(ready);
    return texture;
  };

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

  // Keep the destination sky richly populated at every depth. This remains a
  // single Points draw call, so the added density costs vertices rather than
  // additional scene objects or materials.
  const frontStarCount = isMobile ? 5200 : softwareRendering ? 6200 : balancedQuality ? 7800 : 10400;
  const surroundStarCount = isMobile ? 18000 : softwareRendering ? 22000 : balancedQuality ? 30000 : 42000;
  const starCount = frontStarCount + surroundStarCount;
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
    const wrapsScene = index >= frontStarCount;
    const clusterRoll = Math.random();
    const clusterIndex = !wrapsScene && clusterRoll < 0.17 ? Math.floor(Math.random() * starClusterCenters.length) : -1;
    let screenX: number;
    let screenY: number;
    let sitsInStellarBand = false;
    const positionOffset = index * 3;
    if (wrapsScene) {
      // Populate an actual celestial sphere around the viewer. Keeping this in
      // the existing Points geometry gives the environment complete 360-degree
      // coverage without introducing another draw call.
      const azimuth = Math.random() * Math.PI * 2;
      sitsInStellarBand = Math.random() < 0.42;
      const elevation = sitsInStellarBand ? Math.sin(azimuth * 2.35 + 0.8) * 0.075 + (Math.random() - 0.5) * (0.12 + Math.pow(Math.random(), 2.1) * 0.34) : Math.asin(Math.random() * 2 - 1);
      const latitudeRadius = Math.cos(elevation);
      starPositions[positionOffset] = Math.sin(azimuth) * latitudeRadius * depth;
      starPositions[positionOffset + 1] = Math.sin(elevation) * depth;
      starPositions[positionOffset + 2] = -Math.cos(azimuth) * latitudeRadius * depth;
      screenX = 8;
      screenY = 8;
    } else if (clusterIndex >= 0) {
      const cluster = starClusterCenters[clusterIndex];
      const clusterAngle = Math.random() * Math.PI * 2;
      const clusterRadius = Math.pow(Math.random(), 2.05) * (0.08 + Math.random() * 0.16);
      screenX = cluster[0] + Math.cos(clusterAngle) * clusterRadius;
      screenY = cluster[1] + Math.sin(clusterAngle) * clusterRadius * 0.68;
      sitsInStellarBand = true;
    } else {
      // A majority of this branch now fills the full celestial shell. The
      // denser band remains visible, but no longer leaves broad black fields
      // above and below the composition.
      sitsInStellarBand = Math.random() < 0.43;
      screenX = (Math.random() - 0.5) * 2.42;
      const bandCenter = 0.16 - screenX * 0.23 + Math.sin(screenX * 3.2) * 0.045;
      screenY = sitsInStellarBand ? bandCenter + (Math.random() - 0.5) * (0.1 + Math.pow(Math.random(), 2.25) * 0.29) : (Math.random() - 0.5) * 1.56;
    }
    if (!wrapsScene) {
      starPositions[positionOffset] = screenX * depth;
      starPositions[positionOffset + 1] = screenY * depth;
      starPositions[positionOffset + 2] = -depth;
    }

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
    const distanceFromPlanet = Math.hypot(screenX - projectedPlanetX, screenY - projectedPlanetY);
    const clearsPlanetaryNeighborhood = distanceFromPlanet > projectedPlanetRadius * 1.85;
    const heroStar = clearsPlanetaryNeighborhood && Math.random() < (wrapsScene ? 0.005 : 0.014);
    const midStar = !heroStar && Math.random() < 0.105;
    starSizes[index] = heroStar ? 2.8 + Math.random() * 2.2 : midStar ? 1.45 + Math.random() * 1.35 : 0.6 + Math.pow(Math.random(), 1.95) * 0.8;
    const densityBoost = clusterIndex >= 0 ? 1.12 : sitsInStellarBand ? 1.05 : 1.1;
    starIntensities[index] = heroStar ? 0.82 + Math.random() * 0.18 : (0.36 + Math.pow(Math.random(), 0.78) * 0.48) * densityBoost;
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
  const starMaterial = trackMaterial(
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: environmentStarVertexShader,
      fragmentShader: environmentStarFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  const deepStars = new THREE.Points(starGeometry, starMaterial);
  deepStars.frustumCulled = false;
  deepStars.renderOrder = -12;
  group.add(deepStars);

  const veilCount = isMobile ? 500 : softwareRendering ? 600 : balancedQuality ? 720 : 980;
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
    const bandY = 0.16 - bandX * 0.23 + clusterWave + (Math.random() - 0.5) * (0.12 + Math.pow(Math.random(), 1.7) * 0.24);
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
  const veilMaterial = trackMaterial(
    new THREE.ShaderMaterial({
      uniforms: veilUniforms,
      vertexShader: stellarVeilVertexShader,
      fragmentShader: stellarVeilFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  const stellarVeil = new THREE.Points(veilGeometry, veilMaterial);
  stellarVeil.frustumCulled = false;
  stellarVeil.renderOrder = -13;
  group.add(stellarVeil);

  const oceanTexture = loadCriticalTexture(`${BASE_PATH}/textures/bv-abyssal-ocean.webp`);
  oceanTexture.colorSpace = THREE.SRGBColorSpace;
  oceanTexture.wrapS = THREE.RepeatWrapping;
  oceanTexture.wrapT = THREE.ClampToEdgeWrapping;
  oceanTexture.minFilter = THREE.LinearMipmapLinearFilter;
  oceanTexture.magFilter = THREE.LinearFilter;
  oceanTexture.anisotropy = 8;
  textures.push(oceanTexture);

  const stormTexture = loadCriticalTexture(`${BASE_PATH}/textures/bv-planetary-storm-clouds-v3.webp`);
  stormTexture.colorSpace = THREE.SRGBColorSpace;
  stormTexture.wrapS = THREE.RepeatWrapping;
  stormTexture.wrapT = THREE.ClampToEdgeWrapping;
  stormTexture.minFilter = THREE.LinearMipmapLinearFilter;
  stormTexture.magFilter = THREE.LinearFilter;
  stormTexture.anisotropy = 8;
  textures.push(stormTexture);
  const stormHeightTexture = loadCriticalTexture(`${BASE_PATH}/textures/bv-planetary-storm-cloud-height-v3.webp`);
  stormHeightTexture.colorSpace = THREE.NoColorSpace;
  stormHeightTexture.wrapS = THREE.RepeatWrapping;
  stormHeightTexture.wrapT = THREE.ClampToEdgeWrapping;
  stormHeightTexture.minFilter = THREE.LinearMipmapLinearFilter;
  stormHeightTexture.magFilter = THREE.LinearFilter;
  textures.push(stormHeightTexture);
  const planetMaterial = trackMaterial(
    softwareRendering
      ? new THREE.MeshStandardMaterial({
          color: 0x7895a0,
          map: oceanTexture,
          bumpMap: oceanTexture,
          bumpScale: 0.055,
          roughnessMap: oceanTexture,
          emissive: 0x062936,
          emissiveMap: oceanTexture,
          emissiveIntensity: 0.08,
          roughness: 0.24,
          metalness: 0.02,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x7895a0,
          map: oceanTexture,
          bumpMap: oceanTexture,
          bumpScale: 0.055,
          roughnessMap: oceanTexture,
          emissive: 0x062936,
          emissiveMap: oceanTexture,
          emissiveIntensity: 0.08,
          roughness: 0.24,
          metalness: 0.02,
          clearcoat: 0.72,
          clearcoatRoughness: 0.12,
        }),
  );
  const planetGeometry = trackGeometry(new THREE.SphereGeometry(planetRadius, isMobile ? 64 : softwareRendering ? 80 : balancedQuality ? 112 : 192, isMobile ? 40 : softwareRendering ? 48 : balancedQuality ? 72 : 128));
  const planet = new THREE.Mesh(planetGeometry, planetMaterial);
  planet.position.copy(planetPosition);
  // Present the eye of the primary continent-scale cyclone toward camera.
  // The v3 map places that system around equirectangular U 0.23.
  planet.rotation.set(-0.08, 0.12, 0.04);
  group.add(planet);

  const sceneSunDirection = new THREE.Vector3(-14, 18, 9).normalize();
  const createStormLayer = (layer: number, driftX: number, steps: number, relief: number, shadowPass = 0) => {
    const uniforms = {
      uMap: { value: stormTexture },
      uHeightMap: { value: stormHeightTexture },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uLayer: { value: layer },
      uSteps: { value: steps },
      uRelief: { value: relief },
      uShadowPass: { value: shadowPass },
      uDrift: {
        value: new THREE.Vector2(driftX, layer > 0.5 ? 0.00016 : 0.0001),
      },
      uSunDirection: { value: sceneSunDirection },
    };
    const material = trackMaterial(
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: stormCloudVertexShader,
        fragmentShader: stormCloudFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      }),
    );
    return { uniforms, material };
  };

  const stormShadowLayer = softwareRendering
    ? null
    : createStormLayer(0, 0.00006, isMobile ? 1 : balancedQuality ? 3 : 4, 0, 1);
  const stormShadows = stormShadowLayer
    ? new THREE.Mesh(planetGeometry, stormShadowLayer.material)
    : null;
  // The authored storm map and the cloud volume shader already carry their
  // own occlusion. On a software rasterizer this additional full-planet pass
  // is disproportionately expensive and visually redundant.
  if (stormShadows) {
    stormShadows.position.copy(planet.position);
    stormShadows.rotation.copy(planet.rotation);
    stormShadows.scale.setScalar(1.006);
    stormShadows.renderOrder = 1;
    group.add(stormShadows);
  }

  const lowerStormLayer = createStormLayer(0, 0.00006, isMobile || softwareRendering ? 2 : balancedQuality ? 4 : 6, isMobile ? 0.14 : 0.22);
  const lowerStormClouds = new THREE.Mesh(planetGeometry, lowerStormLayer.material);
  lowerStormClouds.position.copy(planet.position);
  lowerStormClouds.rotation.copy(planet.rotation);
  lowerStormClouds.scale.setScalar(1.009);
  lowerStormClouds.renderOrder = 2;
  group.add(lowerStormClouds);

  const anvilStormLayer = createStormLayer(0.56, 0.000025, isMobile || softwareRendering ? 2 : balancedQuality ? 4 : 5, isMobile ? 0.24 : 0.36);
  const anvilStormClouds = new THREE.Mesh(planetGeometry, anvilStormLayer.material);
  anvilStormClouds.position.copy(planet.position);
  anvilStormClouds.rotation.copy(planet.rotation);
  anvilStormClouds.scale.setScalar(1.019);
  anvilStormClouds.renderOrder = 3;
  group.add(anvilStormClouds);

  const upperStormLayer = createStormLayer(1, -0.000015, isMobile || softwareRendering ? 1 : balancedQuality ? 3 : 4, isMobile ? 0.34 : 0.52);
  const upperStormClouds = new THREE.Mesh(planetGeometry, upperStormLayer.material);
  upperStormClouds.position.copy(planet.position);
  upperStormClouds.rotation.copy(planet.rotation);
  upperStormClouds.scale.setScalar(1.031);
  upperStormClouds.renderOrder = 4;
  group.add(upperStormClouds);

  const createAtmosphereLayer = (innerLayer: number, side: THREE.Side, additive: boolean) => {
    const uniforms = {
      uOpacity: { value: 0 },
      uInnerLayer: { value: innerLayer },
      uSunDirection: { value: sceneSunDirection },
    };
    const material = trackMaterial(
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        side,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
      }),
    );
    return { uniforms, material };
  };

  const innerAtmosphereLayer = createAtmosphereLayer(1, THREE.FrontSide, false);
  const innerAtmosphere = new THREE.Mesh(planetGeometry, innerAtmosphereLayer.material);
  innerAtmosphere.scale.setScalar(1.047);
  innerAtmosphere.position.copy(planet.position);
  innerAtmosphere.renderOrder = 6;
  group.add(innerAtmosphere);

  const outerAtmosphereLayer = createAtmosphereLayer(0, THREE.BackSide, true);
  const outerAtmosphere = new THREE.Mesh(planetGeometry, outerAtmosphereLayer.material);
  outerAtmosphere.scale.setScalar(1.068);
  outerAtmosphere.position.copy(planet.position);
  outerAtmosphere.renderOrder = 7;
  group.add(outerAtmosphere);

  const hullGeometry = trackGeometry(new THREE.BoxGeometry(1, 1, 1));
  const noseGeometry = trackGeometry(new THREE.ConeGeometry(1, 2.8, 4, 1));
  noseGeometry.rotateX(-Math.PI / 2);
  const engineGeometry = trackGeometry(new THREE.CircleGeometry(1, 24));
  const antennaGeometry = trackGeometry(new THREE.CylinderGeometry(0.035, 0.035, 1, 6));

  const hullMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x46535b,
      metalness: 0.88,
      roughness: 0.2,
    }),
  );
  const armorMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x151b20,
      metalness: 0.8,
      roughness: 0.34,
    }),
  );
  const engineMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({
      color: 0x71e5f0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

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

  const createInstancedContacts = (
    contacts: Array<{ scale: number; position: THREE.Vector3; rotationY: number }>,
  ) => {
    const hullMatrices: THREE.Matrix4[] = [];
    const armorMatrices: THREE.Matrix4[] = [];
    const noseMatrices: THREE.Matrix4[] = [];
    const engineMatrices: THREE.Matrix4[] = [];
    const antennaMatrices: THREE.Matrix4[] = [];
    const shipEuler = new THREE.Euler();
    const shipQuaternion = new THREE.Quaternion();
    const partQuaternion = new THREE.Quaternion();
    const shipScale = new THREE.Vector3();
    const partScale = new THREE.Vector3();
    const partPosition = new THREE.Vector3();
    const rootMatrix = new THREE.Matrix4();
    const partMatrix = new THREE.Matrix4();

    const addPart = (
      target: THREE.Matrix4[],
      root: THREE.Matrix4,
      position: [number, number, number],
      scale: [number, number, number],
      rotationZ = 0,
    ) => {
      partPosition.set(...position);
      partScale.set(...scale);
      partQuaternion.setFromEuler(new THREE.Euler(0, 0, rotationZ));
      partMatrix.compose(partPosition, partQuaternion, partScale);
      target.push(root.clone().multiply(partMatrix));
    };

    for (const contact of contacts) {
      shipEuler.set(-0.04, contact.rotationY, -0.035);
      shipQuaternion.setFromEuler(shipEuler);
      shipScale.setScalar(contact.scale);
      rootMatrix.compose(contact.position, shipQuaternion, shipScale);

      addPart(hullMatrices, rootMatrix, [0, 0, 0], [4.9, 0.62, 1.58]);
      addPart(armorMatrices, rootMatrix, [-0.35, 0.51, 0.12], [2.65, 0.34, 0.82]);
      addPart(armorMatrices, rootMatrix, [-2.55, -0.08, 0.18], [2.55, 0.18, 1.86], -0.1);
      addPart(armorMatrices, rootMatrix, [2.55, -0.08, 0.18], [2.55, 0.18, 1.86], 0.1);
      addPart(noseMatrices, rootMatrix, [0, 0, -2.85], [1.55, 1.55, 1.05]);
      for (const x of [-2.1, 0, 2.1]) {
        const engineScale = x === 0 ? 0.34 : 0.27;
        addPart(engineMatrices, rootMatrix, [x, -0.05, 1.605], [engineScale, engineScale, engineScale]);
      }
      addPart(antennaMatrices, rootMatrix, [-0.55, 1.08, 0.05], [1, 1.35, 1]);
    }

    const addBatch = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      matrices: THREE.Matrix4[],
    ) => {
      const batch = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      batch.frustumCulled = false;
      fleet.add(batch);
    };

    addBatch(hullGeometry, hullMaterial, hullMatrices);
    addBatch(hullGeometry, armorMaterial, armorMatrices);
    addBatch(noseGeometry, hullMaterial, noseMatrices);
    addBatch(engineGeometry, engineMaterial, engineMatrices);
    addBatch(antennaGeometry, armorMaterial, antennaMatrices);
  };

  // Foreground contacts occupy their own depth band, well clear of the
  // planetary sphere. Smaller silhouettes deeper in frame sell orbital scale
  // without making a carrier look comparable to a world.
  const flagship = createShip(0.72, new THREE.Vector3(-7.2, flagshipBaseY, -27), 0.18);
  createInstancedContacts([
    { scale: 0.22, position: new THREE.Vector3(2.5, 4.8, -39), rotationY: -0.2 },
    { scale: 0.17, position: new THREE.Vector3(-3.2, -4.2, -45), rotationY: 0.28 },
    { scale: 0.15, position: new THREE.Vector3(-13.5, 3.5, -43), rotationY: 0.08 },
  ]);
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

  const carrierLoad = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      `${BASE_PATH}/models/Carrier.glb`,
      (gltf) => {
        if (assetLoadCancelled) {
          disposeLoadedScene(gltf.scene);
          resolve();
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
        resolve();
      },
      undefined,
      () => {
        // The procedural silhouette remains as a graceful offline fallback.
        resolve();
      },
    );
  });
  criticalAssetLoads.push(carrierLoad);

  const ringGeometry = trackGeometry(new THREE.TorusGeometry(planetRadius * 1.13, 0.022, 4, 128));
  const ringMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({
      color: 0x44cad1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
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

  let lastOpacity = -1;
  const setOpacity = (opacity: number) => {
    const eased = clamp01(opacity);
    if (eased === lastOpacity) return;
    lastOpacity = eased;
    group.visible = eased > 0.001;
    for (const material of materials) material.opacity = eased;
    engineMaterial.opacity = eased * 0.92;
    ringMaterial.opacity = eased * 0.46;
    starUniforms.uOpacity.value = eased * 0.92;
    veilUniforms.uOpacity.value = eased;
    lowerStormLayer.uniforms.uOpacity.value = eased * 0.92;
    anvilStormLayer.uniforms.uOpacity.value = eased * 0.7;
    upperStormLayer.uniforms.uOpacity.value = eased * 0.58;
    if (stormShadowLayer) stormShadowLayer.uniforms.uOpacity.value = eased * 0.46;
    innerAtmosphereLayer.uniforms.uOpacity.value = eased * 0.68;
    outerAtmosphereLayer.uniforms.uOpacity.value = eased * 0.82;
  };

  const update = (elapsedSeconds: number) => {
    if (!group.visible) return;
    starUniforms.uTime.value = elapsedSeconds;
    veilUniforms.uTime.value = elapsedSeconds;
    deepStars.rotation.z = Math.sin(elapsedSeconds * 0.004) * 0.003;
    stellarVeil.rotation.z = -0.035 + Math.sin(elapsedSeconds * 0.0025) * 0.004;
    lowerStormLayer.uniforms.uTime.value = elapsedSeconds;
    anvilStormLayer.uniforms.uTime.value = elapsedSeconds;
    upperStormLayer.uniforms.uTime.value = elapsedSeconds;
    if (stormShadowLayer) stormShadowLayer.uniforms.uTime.value = elapsedSeconds;
    planet.rotation.y = 0.12 + elapsedSeconds * 0.008;
    orbitalRing.rotation.z = 0.12 + elapsedSeconds * 0.018;
    if (stormShadows) {
      stormShadows.rotation.copy(planet.rotation);
      stormShadows.rotation.y += elapsedSeconds * 0.00062;
    }
    lowerStormClouds.rotation.copy(planet.rotation);
    lowerStormClouds.rotation.y += elapsedSeconds * 0.00062;
    anvilStormClouds.rotation.copy(planet.rotation);
    anvilStormClouds.rotation.y += elapsedSeconds * 0.00048;
    upperStormClouds.rotation.copy(planet.rotation);
    upperStormClouds.rotation.y += elapsedSeconds * 0.00032;
  };

  const cancelAssetLoad = () => {
    assetLoadCancelled = true;
  };

  const ready = Promise.all(criticalAssetLoads).then(() => undefined);

  return {
    group,
    fleet,
    flagship,
    planet,
    orbitalRing,
    rimLight,
    interfaceAnchor,
    geometries,
    materials,
    textures,
    ready,
    setOpacity,
    update,
    cancelAssetLoad,
  };
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
  const [mobileVisitor, setMobileVisitor] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);

  useEffect(() => {
    // The fallback renderer owns the same class while it is mounted.
    if (fallback) return;
    let unlockTimer: number | null = null;
    if (jumping) {
      document.documentElement.classList.add("hyperspace-scroll-lock");
    } else {
      // Hold the viewport through the brief arrival handoff so the scrollbar
      // cannot appear mid-transition and nudge the composition.
      unlockTimer = window.setTimeout(() => {
        document.documentElement.classList.remove("hyperspace-scroll-lock");
      }, 260);
    }
    return () => {
      if (unlockTimer !== null) window.clearTimeout(unlockTimer);
    };
  }, [fallback, jumping]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove("hyperspace-scroll-lock");
    },
    [],
  );

  const engage = useCallback((audioEnabled: boolean) => {
    audioRef.current?.setMuted(!audioEnabled);
    window.localStorage.setItem("black-vector-audio-muted", String(!audioEnabled));
    window.dispatchEvent(new Event(AUDIO_SYNC_EVENT));
    setNeedsEngagement(false);
    setExperienceReady(true);
    void audioRef.current?.start();
  }, []);

  const finish = useCallback((audioFadeSeconds = 0.1) => {
    skipJumpRef.current = true;
    audioRef.current?.finishTransit(audioFadeSeconds);
    window.sessionStorage.setItem(SEEN_KEY, "true");
    document.documentElement.classList.add("experience-arriving");
    if (interfaceTimerRef.current) window.clearTimeout(interfaceTimerRef.current);
    interfaceTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove("experience-arriving");
      document.documentElement.classList.add("experience-landed");
    }, 260);
    setJumping(false);
  }, []);

  const skipIntro = useCallback(() => {
    setNeedsEngagement(false);
    setExperienceReady(true);
    finish(0.08);
  }, [finish]);

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
    const isMobileVisitor = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 760;
    const storedAudioPreference = window.localStorage.getItem("black-vector-audio-muted");
    const storedMuted = storedAudioPreference === null ? isMobileVisitor : storedAudioPreference === "true";
    const storedVolumePreference = Number.parseFloat(window.localStorage.getItem(AUDIO_VOLUME_KEY) ?? "0.3");
    const storedVolume = Number.isFinite(storedVolumePreference) ? clamp01(storedVolumePreference) : 0.3;
    const audio = new HyperspaceAudio(storedMuted, storedVolume);
    audioRef.current = audio;
    if (!storedMuted) audio.prepare();
    const readinessTimer = window.setTimeout(() => {
      setCaptureActive(captureMode);
      setMobileVisitor(isMobileVisitor);
      setNeedsEngagement(captureMode ? false : !hasSeenJump && !reducedMotion);
      setExperienceReady(captureMode || hasSeenJump || reducedMotion);
    }, 0);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-audio-toggle]"),
    );
    const volumeControls = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-audio-volume]"),
    );
    const volumeValues = Array.from(
      document.querySelectorAll<HTMLOutputElement>("[data-audio-volume-value]"),
    );
    const updateButton = () => {
      for (const button of buttons) {
        button.textContent = audio.isMuted ? "AUDIO // OFF" : "AUDIO // ON";
        button.setAttribute("aria-pressed", String(!audio.isMuted));
      }
    };
    const updateVolumeControl = () => {
      const percentage = Math.round(audio.currentVolume * 100);
      for (const volumeControl of volumeControls) {
        volumeControl.value = String(percentage);
        volumeControl.style.setProperty("--audio-volume", `${percentage}%`);
        volumeControl.setAttribute("aria-valuetext", `${percentage} percent`);
      }
      for (const volumeValue of volumeValues) {
        volumeValue.value = String(percentage).padStart(3, "0");
      }
    };
    const toggleAudio = () => {
      const muted = !audio.isMuted;
      audio.setMuted(muted);
      window.localStorage.setItem("black-vector-audio-muted", String(muted));
      updateButton();
    };
    const changeVolume = (event: Event) => {
      const volumeControl = event.currentTarget as HTMLInputElement;
      const volume = clamp01(Number(volumeControl.value) / 100);
      audio.setVolume(volume);
      window.localStorage.setItem(AUDIO_VOLUME_KEY, String(volume));
      updateVolumeControl();
    };
    const syncAudioControls = () => {
      updateButton();
      updateVolumeControl();
    };
    const startScoreOnGesture = () => {
      void audio.startMusic();
      window.removeEventListener("pointerdown", startScoreOnGesture);
      window.removeEventListener("keydown", startScoreOnGesture);
    };
    updateButton();
    updateVolumeControl();
    buttons.forEach((button) => button.addEventListener("click", toggleAudio));
    volumeControls.forEach((control) =>
      control.addEventListener("input", changeVolume),
    );
    window.addEventListener(AUDIO_SYNC_EVENT, syncAudioControls);
    if (hasSeenJump || reducedMotion) {
      void audio.startMusic();
      window.addEventListener("pointerdown", startScoreOnGesture, {
        once: true,
      });
      window.addEventListener("keydown", startScoreOnGesture, { once: true });
    }
    return () => {
      window.clearTimeout(readinessTimer);
      buttons.forEach((button) =>
        button.removeEventListener("click", toggleAudio),
      );
      volumeControls.forEach((control) =>
        control.removeEventListener("input", changeVolume),
      );
      window.removeEventListener(AUDIO_SYNC_EVENT, syncAudioControls);
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
      if (event.key === "Escape" && jumping) finish(0.08);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, jumping]);

  useEffect(() => {
    if (fallback || !experienceReady) return;
    const searchParams = new URLSearchParams(window.location.search);
    const captureMode = searchParams.get("capture") === "hyperspace";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldJump = captureMode || runId > 0 || (!window.sessionStorage.getItem(SEEN_KEY) && !reducedMotion);
    skipJumpRef.current = !shouldJump;
    document.documentElement.classList.remove("experience-arriving");
    document.documentElement.classList.toggle("experience-landed", !shouldJump);
    const settleTimer = !shouldJump ? window.setTimeout(() => setJumping(false), 0) : null;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const viewportPixels = window.innerWidth * window.innerHeight;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const hardwareThreads = navigator.hardwareConcurrency || 8;
    const qualityPreference = searchParams.get("quality");

    // Ask the browser whether WebGL would represent a major performance
    // caveat before creating the production renderer. Browsers backed by
    // SwiftShader/other software rasterizers commonly reject this probe, and
    // the debug renderer string catches the implementations that do not.
    const probeCanvas = document.createElement("canvas");
    const probeAttributes: WebGLContextAttributes = {
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
    };
    const probeContext = probeCanvas.getContext("webgl2", probeAttributes) ?? probeCanvas.getContext("webgl", probeAttributes);
    const probeDebugInfo = probeContext?.getExtension("WEBGL_debug_renderer_info");
    const probeRenderer = probeContext && probeDebugInfo ? String(probeContext.getParameter(probeDebugInfo.UNMASKED_RENDERER_WEBGL)) : "";
    const softwareRendering = !captureMode && (qualityPreference === "software" || probeContext === null || /swiftshader|llvmpipe|softpipe|software raster|microsoft basic render/i.test(probeRenderer));
    probeContext?.getExtension("WEBGL_lose_context")?.loseContext();

    const balancedQuality = !captureMode && (qualityPreference === "balanced" || (qualityPreference !== "cinematic" && (softwareRendering || isMobile || viewportPixels > 3_000_000 || deviceMemory <= 4 || hardwareThreads <= 6)));

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: captureMode || !balancedQuality,
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
      uOpacity: { value: shouldJump ? 0.36 : 0 },
      uForwardStretch: { value: shouldJump ? 0.035 : 0 },
      uBackwardStretch: { value: shouldJump ? 0.035 : 1 },
      uWidthScale: { value: shouldJump ? 0.76 : 1 },
      uEnergy: { value: shouldJump ? 0.34 : 1 },
      uSymmetry: { value: shouldJump ? 1 : 0 },
      uWarpTension: { value: 0 },
      uWarpRelease: { value: 0 },
      uWarpPhase: { value: 0 },
      uWarpCruise: { value: 0 },
      uFormation: { value: 0 },
      uPressurePulse: { value: 0 },
      uPressurePhase: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const geometry = createTunnelGeometry(isMobile ? 1350 : softwareRendering ? 1500 : balancedQuality ? 1750 : 2300);
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
      uLaunchDust: { value: 0 },
      uFormation: { value: 0 },
      uPressurePulse: { value: 0 },
      uPressurePhase: { value: 0 },
    };
    const tunnelDustGeometry = createTunnelDustGeometry(isMobile ? 1150 : softwareRendering ? 1700 : balancedQuality ? 2100 : 3000);
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
    const warpBubbleGeometry = createWarpBubbleGeometry(isMobile || softwareRendering || balancedQuality);
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

    const exitDustUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const exitDustGeometry = createExitDustGeometry(isMobile ? 12200 : softwareRendering ? 16000 : balancedQuality ? 22000 : 34000);
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
    exitDust.visible = false;
    scene.add(exitDust);

    const world = createDeepSpaceWorld(isMobile, balancedQuality, softwareRendering);
    let disposed = false;
    let worldAssetsReady = false;
    let worldAssetFade = 0;
    world.setOpacity(0);
    scene.add(world.group);

    // Decode, upload, and compile the destination while the visitor is still
    // in transit. The planet remains hidden until the complete material stack
    // is GPU-ready, preventing the flat placeholder/texture pop at exit.
    void world.ready.then(async () => {
      if (disposed) return;
      for (const texture of world.textures) renderer.initTexture(texture);
      world.group.visible = true;
      try {
        await renderer.compileAsync(world.group, camera);
      } catch {
        // The normal render path remains a graceful fallback when a driver
        // does not support asynchronous shader compilation.
      }
      if (disposed) return;
      worldAssetsReady = true;
      world.group.visible = worldAssetFade > 0.001;
    });

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
        const anchorX = anchor.element.dataset.worldAnchor === "flagship" ? THREE.MathUtils.clamp(rawAnchorX, isMobile ? 0.34 : 0.18, 0.92) : THREE.MathUtils.clamp(rawAnchorX, 0.08, isMobile ? 0.66 : 0.78);
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

    let renderWidth = 0;
    let renderHeight = 0;
    let renderPixelRatio = 0;
    let adaptiveRenderScale = 1;
    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
      const height = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight));
      // The capture route uses a fixed 2x backing surface. The master renderer
      // supplies a 1920x1080 viewport for a native 3840x2160 capture surface,
      // bypassing browser compositor scaling and tile seams.
      // Interactive playback begins at the display's native backing resolution.
      // Only the software-rendering tier may lower its internal canvas scale
      // when measured frame pacing cannot sustain the cinematic target; DOM
      // interface elements remain at native resolution.
      const nativePixelRatio = captureMode ? 2 : window.devicePixelRatio || 1;
      const pixelRatio = nativePixelRatio * adaptiveRenderScale;
      if (width === renderWidth && height === renderHeight && pixelRatio === renderPixelRatio) return;
      renderWidth = width;
      renderHeight = height;
      renderPixelRatio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
      lensPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      renderer.setAnimationLoop(null);
      setFallback(true);
    };

    let startTime = 0;
    let previousTime = 0;
    let lastSoftwareFrame = 0;
    let travel = 0;
    let dustTravel = 0;
    let jumpComplete = !shouldJump;
    let finishQueued = !shouldJump;
    let landingStartTime: number | null = null;
    let interfaceRevealStarted = !shouldJump;
    const cameraTarget = new THREE.Vector3(0, 0, -100);
    const desiredTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const interfaceFar = new THREE.Vector3(0, 0, -118);
    const interfaceNear = new THREE.Vector3(isMobile ? -7.5 : -13, isMobile ? 0.5 : -0.4, -26);
    let frameIntervalEma = 0;
    let slowFrameDuration = 0;
    let fastFrameDuration = 0;
    let lastAdaptiveScaleChange = 0;
    const adaptRenderScale = (time: number, frameInterval: number) => {
      if (
        !softwareRendering ||
        captureMode ||
        qualityPreference === "cinematic" ||
        document.visibilityState !== "visible" ||
        frameInterval <= 0 ||
        frameInterval >= 250
      ) return;

      frameIntervalEma = frameIntervalEma === 0
        ? frameInterval
        : THREE.MathUtils.lerp(frameIntervalEma, frameInterval, 0.12);
      if (frameIntervalEma > 44) {
        slowFrameDuration += frameInterval;
        fastFrameDuration = 0;
      } else if (frameIntervalEma < 35) {
        fastFrameDuration += frameInterval;
        slowFrameDuration = Math.max(0, slowFrameDuration - frameInterval * 0.5);
      } else {
        slowFrameDuration = Math.max(0, slowFrameDuration - frameInterval * 0.25);
        fastFrameDuration = 0;
      }

      if (
        slowFrameDuration >= 1200 &&
        time - lastAdaptiveScaleChange >= 1200 &&
        adaptiveRenderScale > 0.55
      ) {
        // Raster cost is approximately proportional to pixel area, so use the
        // square root of the frame-budget ratio to converge in one or two
        // reallocations instead of introducing a series of visible resize
        // hitches during the charge-up.
        const budgetScale = adaptiveRenderScale * Math.sqrt(36 / frameIntervalEma) * 0.96;
        adaptiveRenderScale = Math.max(
          0.55,
          Math.min(adaptiveRenderScale - 0.05, Math.round(budgetScale * 100) / 100),
        );
        slowFrameDuration = 0;
        fastFrameDuration = 0;
        lastAdaptiveScaleChange = time;
        canvas.dataset.renderScale = adaptiveRenderScale.toFixed(2);
        resize();
      } else if (
        fastFrameDuration >= 15000 &&
        time - lastAdaptiveScaleChange >= 15000 &&
        adaptiveRenderScale < 1
      ) {
        adaptiveRenderScale = Math.min(1, Math.round((adaptiveRenderScale + 0.05) * 100) / 100);
        slowFrameDuration = 0;
        fastFrameDuration = 0;
        lastAdaptiveScaleChange = time;
        canvas.dataset.renderScale = adaptiveRenderScale.toFixed(2);
        resize();
      }
    };
    const animate = (time: number) => {
      // A locked 30 fps cadence is substantially smoother than irregularly
      // missing 60 fps under a software rasterizer. Animation remains based on
      // elapsed time, so audio and the cinematic timeline stay synchronized.
      if (softwareRendering && qualityPreference !== "cinematic" && lastSoftwareFrame > 0 && time - lastSoftwareFrame < 1000 / 30) {
        return;
      }
      lastSoftwareFrame = time;

      if (!startTime) {
        startTime = time;
        previousTime = time;
        if (!shouldJump) landingStartTime = time - 2000;
      }

      const elapsed = time - startTime;
      const frameInterval = time - previousTime;
      const delta = Math.min(frameInterval / 1000, 0.05);
      previousTime = time;
      if (worldAssetsReady) worldAssetFade = Math.min(1, worldAssetFade + delta * 2.8);
      let currentInterfaceArrival = jumpComplete ? 1 : 0;

      if (!jumpComplete) {
        const progress = skipJumpRef.current ? 1 : clamp01(elapsed / DURATION);
        // The destination interface now enters during the final braking veil,
        // not after the cinematic state flips. Camera, FOV, dust, and DOM UI
        // therefore resolve on one shared handoff curve.
        const handoffBlend = smoothstep((progress - 0.94) / 0.06);
        currentInterfaceArrival = handoffBlend;
        world.interfaceAnchor.position.lerpVectors(interfaceFar, interfaceNear, handoffBlend);
        if (!interfaceRevealStarted && progress >= 0.948) {
          interfaceRevealStarted = true;
          document.documentElement.classList.add("experience-arriving");
        }
        // Keep the light wall charging while acceleration begins so the short
        // traces stretch into hyperspace as one uninterrupted motion.
        // A nearly linear five-second charge leaves visible growth available
        // all the way to ignition. The old smoothstep + power stack reached
        // most of its apparent size too early and made the final second hold.
        const sequencePressure = clamp01((progress - 0.018) / (LAUNCH_PROGRESS - 0.018));
        const charge = sequencePressure;
        const launchProgress = clamp01((progress - LAUNCH_PROGRESS) / 0.0065);
        const launch = 1 - Math.pow(1 - launchProgress, 6);
        const visualLaunch = smoothstep((progress - LAUNCH_PROGRESS) / 0.013);
        const tensionAttack = smoothstep((sequencePressure - 0.08) / 0.72);
        const tensionRelease = 1 - smoothstep((progress - LAUNCH_PROGRESS) / 0.028);
        const warpTension = tensionAttack * tensionRelease;
        const warpReleaseAttack = smoothstep((progress - LAUNCH_PROGRESS) / 0.014);
        const warpReleaseFade = 1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.295)) / 0.16);
        const warpRelease = warpReleaseAttack * warpReleaseFade;
        const launchImpulse = smoothstep((progress - (LAUNCH_PROGRESS - 0.002)) / 0.005) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.025)) / 0.018));
        const launchSnap = smoothstep((progress - (LAUNCH_PROGRESS + 0.001)) / 0.0035) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.018)) / 0.014));
        // Recoil lands first, then the lens rapidly collapses toward the mouth
        // of the tunnel. This stagger is what makes the launch feel as though
        // the ship is being grabbed and pulled forward instead of merely cut
        // to a wider field of view.
        const crashZoom = smoothstep((progress - (LAUNCH_PROGRESS + 0.002)) / 0.0065) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.024)) / 0.018));
        const launchRumble = smoothstep((progress - (LAUNCH_PROGRESS - 0.004)) / 0.008) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.078)) / 0.052));
        const secondaryKick = smoothstep((progress - (LAUNCH_PROGRESS + 0.018)) / 0.009) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.07)) / 0.035));
        // First-person translation of the familiar third-person ship stretch:
        // the field becomes one narrow quantum streak from the 5.54s body hit
        // through the 5.88s sub impact, then releases into full tunnel speed.
        const streakStretch = smoothstep((progress - (LAUNCH_PROGRESS - 0.014)) / 0.012) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.012)) / 0.012));
        const bowCharge = smoothstep((sequencePressure - 0.68) / 0.32) * (1 - launch);
        const bowRelease = smoothstep((progress - (LAUNCH_PROGRESS - 0.002)) / 0.004) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.06)) / 0.045));
        const bowWave = Math.max(bowCharge * 0.34, bowRelease);
        const bowPhase = clamp01((progress - (LAUNCH_PROGRESS - 0.006)) / 0.067);
        const warpPhase = clamp01((progress - LAUNCH_PROGRESS) / 0.21);
        const braking = smoothstep((progress - 0.84) / 0.055);
        const exitArrival = smoothstep((progress - 0.89) / 0.11);
        let pressurePulse = 0;
        let pressurePhase = 0;
        for (const pulseStart of CRUISE_PULSE_STARTS) {
          const localPhase = (progress - pulseStart) / 0.072;
          if (localPhase < 0 || localPhase > 1) continue;
          const localPulse = Math.sin(localPhase * Math.PI);
          if (localPulse <= pressurePulse) continue;
          pressurePulse = localPulse;
          pressurePhase = localPhase;
        }
        const fieldSwayX = Math.sin(elapsed * 0.00108) + Math.sin(elapsed * 0.00047 + 1.8) * 0.42;
        const fieldSwayY = Math.cos(elapsed * 0.00091 + 0.7) + Math.sin(elapsed * 0.00039 + 2.4) * 0.36;
        const cruiseFloatEnvelope = smoothstep((visualLaunch - 0.08) / 0.72) * (1 - braking);
        const cruiseFloatX = Math.sin(elapsed * 0.00043 + 0.8) + Math.sin(elapsed * 0.00019 + 2.3) * 0.48;
        const cruiseFloatY = Math.cos(elapsed * 0.00037 + 1.4) + Math.sin(elapsed * 0.00023 + 0.4) * 0.42;
        const cruiseFloatZ = Math.sin(elapsed * 0.00031 + 2.1) + Math.cos(elapsed * 0.00017 + 0.2) * 0.36;
        const lineGrowth = sequencePressure;
        const preLaunchSpeed = sequencePressure * 7.5;
        const hyperspaceSpeed = 212;
        const speed = THREE.MathUtils.lerp(preLaunchSpeed, hyperspaceSpeed, launch) * (1 - braking) + 0.35 * braking;
        travel += speed * delta;
        const dustSuction = smoothstep((sequencePressure - 0.55) / 0.45);
        const dustReveal = smoothstep((sequencePressure - 0.12) / 0.62);
        const dustSpeed = (sequencePressure * 2.2 + sequencePressure * sequencePressure * 7 + Math.pow(dustSuction, 3) * 30 + streakStretch * 82 + launchSnap * 92 + speed * 1.48) * (1 - braking) + braking * 0.5;
        dustTravel += dustSpeed * delta;
        uniforms.uTravel.value = travel;
        tunnelDustUniforms.uTravel.value = dustTravel;
        const launchDust = launchImpulse * 0.22 + streakStretch * 0.18 + launchSnap * 0.46 + warpRelease * 0.24 + dustSuction * warpTension * 0.18;
        const preLaunchDust = dustReveal * 0.26 + dustSuction * (0.08 + warpTension * 0.14);
        tunnelDustUniforms.uOpacity.value = (0.1 + charge * 0.06 + preLaunchDust + launchDust + visualLaunch * 0.55) * (1 - braking);
        tunnelDustUniforms.uWarpTension.value = warpTension;
        tunnelDustUniforms.uWarpRelease.value = warpRelease;
        tunnelDustUniforms.uWarpPhase.value = warpPhase;
        tunnelDustUniforms.uWarpCruise.value = visualLaunch * (1 - braking);
        tunnelDustUniforms.uFormation.value = sequencePressure;
        tunnelDustUniforms.uPressurePulse.value = pressurePulse;
        tunnelDustUniforms.uPressurePhase.value = pressurePhase;
        tunnelDustUniforms.uLaunchDust.value = Math.min(1, dustReveal * 0.14 + dustSuction * (0.18 + warpTension * 0.46) + streakStretch * 0.72 + launchImpulse * 0.95 + launchSnap * 1.1 + warpRelease * 0.78);
        warpBubbleUniforms.uTime.value = elapsed * 0.001;
        warpBubbleUniforms.uTravel.value = travel;
        warpBubbleUniforms.uCompression.value = warpTension;
        warpBubbleUniforms.uRelease.value = warpRelease;
        warpBubbleUniforms.uCruise.value = visualLaunch * (1 - braking);
        warpBubbleUniforms.uImpact.value = Math.max(launchImpulse, launchSnap, streakStretch, pressurePulse * 0.34);
        warpBubbleUniforms.uOpacity.value = (warpTension * 0.075 + warpRelease * 0.62 + visualLaunch * 0.96 + launchImpulse * 0.13 + launchSnap * 0.22 + pressurePulse * 0.1) * (1 - braking);
        const lensTravelFade = 1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.08)) / 0.14);
        const lensRelease = launchImpulse + warpRelease * lensTravelFade * 0.42;
        const cruiseLens = visualLaunch * (1 - braking);
        const cruiseBreath = 0.2 + Math.sin(elapsed * 0.00072) * 0.008;
        const opticalEventStrength = (warpTension * 2.2 + lensRelease * 2.05 + streakStretch * 0.95 + crashZoom * 3.35 + launchSnap * 3.1) * (1 - braking);
        const lensStrength = opticalEventStrength + cruiseLens * cruiseBreath * (1 - braking);
        const sceneWarp = Math.min(1, (warpTension * (0.34 + sequencePressure * 0.66) + streakStretch * 0.4 + crashZoom * 0.3 + launchImpulse * 0.2 + launchSnap * 0.46 + pressurePulse * 0.06 + cruiseLens * 0.08) * (1 - braking));
        // The 3D bubble mesh already carries the steady cruise distortion.
        // Avoid a second native-resolution fullscreen pass on software
        // rasterizers once the actual compression/launch event has cleared.
        lensPass.enabled = (softwareRendering ? opticalEventStrength : lensStrength) > 0.002;
        lensPass.uniforms.uStrength.value = lensStrength;
        lensPass.uniforms.uSceneWarp.value = sceneWarp;
        lensPass.uniforms.uBowWave.value = bowWave;
        lensPass.uniforms.uBowPhase.value = bowPhase;
        // Keep the optical axis locked to the camera. Moving the distortion
        // center independently from the rig creates a visible rocking motion
        // even when the actual flight path is smooth.
        lensPass.uniforms.uCenter.value.set(0.5, 0.5);
        lensPass.uniforms.uRadius.value = 0.05 + charge * 0.145 - cruiseLens * 0.04 + launchImpulse * 0.02 + launchSnap * 0.055 + crashZoom * 0.135;
        lensPass.uniforms.uStretch.value = warpTension * 0.052 + streakStretch * 0.34 + launchImpulse * 0.27 + launchSnap * 0.62 + crashZoom * 0.43 + warpRelease * lensTravelFade * 0.125 + cruiseLens * 0.006;
        lensPass.uniforms.uFlash.value = Math.min(1, launchImpulse + crashZoom * 0.54 + launchSnap * 0.88);
        lensPass.uniforms.uMotionBlur.value = Math.min(1, crashZoom * 0.78 + streakStretch * 0.92 + launchImpulse * 0.36 + launchSnap * 0.74 + launchRumble * 0.16);
        lensPass.uniforms.uTime.value = elapsed * 0.001;
        lensPass.uniforms.uCruise.value = cruiseLens;
        lensPass.uniforms.uDarkness.value = Math.min(1, warpTension * 0.3 + launchImpulse * 0.08 + cruiseLens * 0.03);
        const staticStretch = THREE.MathUtils.lerp(0.028, 0.74, lineGrowth);
        uniforms.uForwardStretch.value = (staticStretch + streakStretch * 1.62 + launchSnap * 0.58) * (1 - braking) + braking * 0.01;
        uniforms.uBackwardStretch.value = (staticStretch + streakStretch * 2.32 + launchSnap * 0.92 + visualLaunch * 1.04) * (1 - braking) + braking * 0.03;
        uniforms.uWidthScale.value = (0.72 + charge * 0.46 + visualLaunch * 0.4) * (1 - streakStretch * 0.38) * (1 - braking * 0.35);
        uniforms.uEnergy.value = (0.28 + charge * 0.96 + streakStretch * 0.34 + visualLaunch * 0.18) * (1 - braking * 0.48);
        uniforms.uSymmetry.value = 1 - visualLaunch;
        uniforms.uWarpTension.value = warpTension;
        uniforms.uWarpRelease.value = warpRelease;
        uniforms.uWarpPhase.value = warpPhase;
        uniforms.uWarpCruise.value = visualLaunch * (1 - braking);
        uniforms.uFormation.value = sequencePressure;
        uniforms.uPressurePulse.value = pressurePulse;
        uniforms.uPressurePhase.value = pressurePhase;
        uniforms.uOpacity.value = smoothstep(progress / 0.015) * (0.3 + charge * 0.7) * (1 - visualLaunch * 0.14) * (1 - smoothstep((progress - 0.88) / 0.055));
        const exitDustIgnition = smoothstep((progress - 0.822) / 0.022);
        exitDust.visible = exitDustIgnition > 0.001;
        const exitDustWhiteout = exitDustIgnition * (1 - smoothstep((progress - 0.912) / 0.06));
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.818) / 1000);
        exitDustUniforms.uOpacity.value = exitDustIgnition * (1.15 + exitDustWhiteout * 1.35);
        // Let the destination exist behind the collapsing tunnel before the
        // exit completes. The early power curve keeps it subliminal at first,
        // then turns the final tunnel fade into a continuous reveal.
        const destinationForeshadow = Math.pow(smoothstep((progress - 0.86) / 0.14), 1.65);
        world.setOpacity(captureMode ? 0 : destinationForeshadow * worldAssetFade);
        const exitIllumination = smoothstep((progress - 0.842) / 0.042) * (1 - smoothstep((progress - 0.982) / 0.034));
        const exposureSpike = smoothstep((progress - (LAUNCH_PROGRESS - 0.001)) / 0.003) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.014)) / 0.01));
        const exposureSettle = smoothstep((progress - (LAUNCH_PROGRESS + 0.011)) / 0.008) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.04)) / 0.022));
        world.rimLight.intensity = SCENE_RIM_BASE + exitIllumination * EXIT_RIM_BOOST + exitDustWhiteout * 34;
        renderer.toneMappingExposure = 1.0 + charge * 0.17 + launch * 0.08 + launchImpulse * 0.18 + warpRelease * 0.035 + exposureSpike * 0.34 - exposureSettle * 0.1 + pressurePulse * 0.025 + exitIllumination * 0.18 + exitDustWhiteout * 0.42;

        const launchLocal = clamp01((progress - LAUNCH_PROGRESS) / 0.11);
        const pressureDrift = warpTension * (1 - launch) * 0.07;
        const impactKick = smoothstep((progress - (LAUNCH_PROGRESS - 0.002)) / 0.004) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.018)) / 0.016));
        const preLaunchZoom = smoothstep((progress - (LAUNCH_PROGRESS - 0.145)) / 0.115) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.012)) / 0.024));
        const launchShake = smoothstep((progress - LAUNCH_PROGRESS) / 0.004) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.07)) / 0.06));
        const brakingShake = smoothstep((progress - 0.82) / 0.05) * (1 - smoothstep((progress - 0.965) / 0.035));
        const exitStopKick = smoothstep((progress - 0.835) / 0.018) * (1 - smoothstep((progress - 0.905) / 0.05));
        const impactDecay = launchShake * (1 - smoothstep(launchLocal));
        const shakeStrength = impactKick * 0.105 + impactDecay * 0.055 + launchShake * 0.025 + launchSnap * 0.16 + launchRumble * (0.022 + secondaryKick * 0.025) + brakingShake * 0.032 + exitStopKick * 0.06;
        const cameraDive = smoothstep((progress - (LAUNCH_PROGRESS + 0.004)) / 0.008) * (1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.1)) / 0.07));
        // Keep the physical recoil almost imperceptible. A large backward
        // translation followed by the crash zoom reads as a rubber-band camera
        // move, so the seat impact is carried by optical compression, rumble,
        // and forward acceleration instead.
        const recoilAttack = smoothstep((progress - (LAUNCH_PROGRESS - 0.001)) / 0.003);
        const recoilRelease = 1 - smoothstep((progress - (LAUNCH_PROGRESS + 0.025)) / 0.02);
        const recoilEnvelope = recoilAttack * recoilRelease;
        const launchRecoil = recoilEnvelope * 0.28;
        const shakeX = Math.sin(elapsed * 0.043) + Math.sin(elapsed * 0.071 + 1.7) * 0.38;
        const shakeY = Math.cos(elapsed * 0.037 + 0.6) + Math.sin(elapsed * 0.083) * 0.31;
        const shakeZ = Math.sin(elapsed * 0.052 + 2.1) + Math.sin(elapsed * 0.097) * 0.24;
        // Hull vibration is transmitted through the camera mount: dense,
        // high-frequency vertical and longitudinal tremors with almost no
        // lateral travel. It rises under late-charge load, peaks at ignition,
        // then clears rather than turning cruise into handheld camera shake.
        const hullCharge = smoothstep((sequencePressure - 0.58) / 0.42) * (1 - launch);
        const hullEnvelope = hullCharge * 0.3 + launchRumble;
        const hullVibrationX = Math.sin(elapsed * 0.061 + 2.1) * 0.18 + Math.sin(elapsed * 0.089 + 0.6) * 0.08;
        const hullVibrationY = Math.sin(elapsed * 0.052 + 0.3) * 0.55 + Math.sin(elapsed * 0.077 + 1.7) * 0.28 + Math.sin(elapsed * 0.031 + 2.4) * 0.17;
        const hullVibrationZ = Math.sin(elapsed * 0.038 + 1.2) * 0.5 + Math.sin(elapsed * 0.068 + 2.6) * 0.22;
        const cinematicDriftX = fieldSwayX * (charge * 0.095 + visualLaunch * 0.14) * (1 - braking);
        const cinematicDriftY = fieldSwayY * (charge * 0.068 + visualLaunch * 0.1) * (1 - braking);
        const cruiseDriftX = cruiseFloatX * cruiseFloatEnvelope * 0.26;
        const cruiseDriftY = cruiseFloatY * cruiseFloatEnvelope * 0.18;
        const cruiseDriftZ = cruiseFloatZ * cruiseFloatEnvelope * 0.28;
        const chargeLookX = fieldSwayX * charge * (1 - braking) * 0.045;
        const chargeLookY = fieldSwayY * charge * (1 - braking) * 0.032;
        const cruiseLookX = cruiseFloatX * cruiseFloatEnvelope * 0.085;
        const cruiseLookY = cruiseFloatY * cruiseFloatEnvelope * 0.06;
        const rigX = Math.sin(elapsed * 0.0018) * pressureDrift + cinematicDriftX + cruiseDriftX;
        const rigY = -pressureDrift * 0.42 + cinematicDriftY + cruiseDriftY;
        const hyperspaceCameraX = rigX + shakeX * shakeStrength * 0.16 + hullVibrationX * hullEnvelope * 0.018;
        const hyperspaceCameraY = rigY + shakeY * shakeStrength * 0.22 + hullVibrationY * hullEnvelope * 0.055;
        const hyperspaceCameraZ = -0.9 * exitArrival - charge * (1 - launch) * 1.2 + launchRecoil - cameraDive * 4.25 - crashZoom * 6.8 + shakeZ * shakeStrength * 0.18 + exitStopKick * 0.34 + hullVibrationZ * hullEnvelope * 0.035 + cruiseDriftZ;
        camera.position.set(THREE.MathUtils.lerp(hyperspaceCameraX, 0, handoffBlend), THREE.MathUtils.lerp(hyperspaceCameraY, 0, handoffBlend), THREE.MathUtils.lerp(hyperspaceCameraZ, -0.9, handoffBlend));
        const hyperspaceTargetX = rigX + chargeLookX + cruiseLookX + hullVibrationX * hullEnvelope * 0.008 + shakeX * launchShake * 0.02;
        const hyperspaceTargetY = rigY + chargeLookY + cruiseLookY + recoilEnvelope * 0.16 - crashZoom * 0.5 + hullVibrationY * hullEnvelope * 0.015 + shakeY * launchShake * 0.014;
        const hyperspaceTargetZ = THREE.MathUtils.lerp(-100, -38, exitArrival) + cruiseFloatZ * cruiseFloatEnvelope * 1.15 - crashZoom * 9.4;
        cameraTarget.set(THREE.MathUtils.lerp(hyperspaceTargetX, 0, handoffBlend), THREE.MathUtils.lerp(hyperspaceTargetY, 0, handoffBlend), THREE.MathUtils.lerp(hyperspaceTargetZ, -38, handoffBlend));
        camera.lookAt(cameraTarget);
        camera.rotation.z += hullVibrationX * hullEnvelope * 0.0015 + shakeX * shakeStrength * 0.0018 + impactKick * 0.0018 + launchSnap * 0.0014 + recoilEnvelope * 0.001;
        const hyperspaceFov = 62 + charge * 2.5 - warpTension * 9.5 - preLaunchZoom * 10.5 - crashZoom * 33 + visualLaunch * 27 + impactKick * 6.2 + recoilEnvelope * 1.1 + cameraDive * 8 + exitStopKick * 3.6 + cruiseFloatZ * cruiseFloatEnvelope * 0.12 + hullVibrationZ * hullEnvelope * 0.12 - braking * 23.5;
        // End the optical compression at the exact theater FOV used by the
        // destination. This removes the apparent planet/browser resize during
        // the handoff without weakening the braking beat beforehand.
        camera.fov = THREE.MathUtils.lerp(hyperspaceFov, 64, handoffBlend);
        camera.updateProjectionMatrix();

        if (progress >= 1) {
          jumpComplete = true;
          landingStartTime = time;
          tunnel.visible = false;
          tunnelDust.visible = false;
          warpBubble.visible = false;
          lensPass.enabled = false;
          world.setOpacity(captureMode ? 0 : worldAssetFade);
          renderer.toneMappingExposure = SCENE_EXPOSURE;
        }
      } else {
        const landingElapsed = landingStartTime === null ? 1600 : Math.max(0, time - landingStartTime);
        world.setOpacity(captureMode ? 0 : worldAssetFade);
        // The soundtrack carries a deliberate exit decay well beyond the
        // tunnel collapse. Hold the cinematic state through that tail so the
        // diamond-dust veil, score crossfade, and final camera lock can settle
        // together instead of cutting at the first fully landed frame.
        if (!finishQueued && landingElapsed >= EXIT_SETTLE_DURATION && worldAssetFade >= 0.25) {
          finishQueued = true;
          if (!captureMode) finish(0.7);
        }
        const dustFade = 1 - smoothstep(landingElapsed / 4200);
        exitDustUniforms.uTime.value = Math.max(0, (elapsed - DURATION * 0.818) / 1000);
        // Preserve the veil's brightness across the jump-complete boundary so
        // the destination emerges from one continuous diamond-dust curtain.
        exitDustUniforms.uOpacity.value = dustFade * 1.15;
        world.rimLight.intensity = SCENE_RIM_BASE + (exitDust.visible ? dustFade * EXIT_RIM_BOOST * 0.62 : 0);
        if (dustFade <= 0.001) exitDust.visible = false;
        const interfaceArrival = 1;
        currentInterfaceArrival = interfaceArrival;
        world.interfaceAnchor.position.lerpVectors(interfaceFar, interfaceNear, interfaceArrival);
        const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const scrollProgress = clamp01(window.scrollY / documentHeight);
        desiredCamera.set(scrollProgress * 6.5, -scrollProgress * 3.2, -0.9 - scrollProgress * 10.5);
        const cameraDamping = 1 - Math.pow(0.004, delta);
        camera.position.lerp(desiredCamera, cameraDamping);
        desiredTarget.set(-scrollProgress * 2, scrollProgress * 0.4, -38 - scrollProgress * 12);
        cameraTarget.lerp(desiredTarget, cameraDamping);
        camera.lookAt(cameraTarget);
        camera.fov = THREE.MathUtils.lerp(camera.fov, 64 - scrollProgress * 2, cameraDamping);
        camera.updateProjectionMatrix();

        world.fleet.rotation.y = Math.sin(elapsed * 0.00008) * 0.022;
        world.flagship.position.y = -1.45 + Math.sin(elapsed * 0.00034) * 0.08;
      }

      const destinationElapsedSeconds = Math.max(0, (elapsed - DURATION * 0.86) / 1000);
      world.update(destinationElapsedSeconds);
      if (currentInterfaceArrival > 0 || jumpComplete) updateWorldAnchors(currentInterfaceArrival);
      if (lensPass.enabled) composer.render(delta);
      else renderer.render(scene, camera);
      adaptRenderScale(time, frameInterval);
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
      // Queue the destination and exit shaders before they first become
      // visible. compileAsync traverses the scene synchronously, so the
      // visibility flags can be restored immediately while the driver finishes
      // compiling in parallel with the early charge-up frames.
      if (shouldJump) {
        const worldWasVisible = world.group.visible;
        const dustWasVisible = exitDust.visible;
        world.group.visible = true;
        exitDust.visible = true;
        void renderer.compileAsync(scene, camera).catch(() => undefined);
        world.group.visible = worldWasVisible;
        exitDust.visible = dustWasVisible;
      }
      renderer.setAnimationLoop(animate);
    }

    return () => {
      disposed = true;
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
      scene.remove(exitDust);
      geometry.dispose();
      material.dispose();
      tunnelDustGeometry.dispose();
      tunnelDustMaterial.dispose();
      warpBubbleGeometry.dispose();
      warpBubbleMaterial.dispose();
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

  useEffect(
    () => () => {
      if (interfaceTimerRef.current) window.clearTimeout(interfaceTimerRef.current);
      document.documentElement.classList.remove("experience-arriving");
    },
    [],
  );

  if (fallback) return <HyperspaceIntro2D />;

  return (
    <>
      {needsEngagement && (
        <div className="cinema-gate">
          <span>BLACK VECTOR // SECURE TRANSIT</span>
          <strong>INITIATE TRANSIT</strong>
          <div className="cinema-gate-options">
            <button
              className={mobileVisitor ? "cinema-gate-primary" : undefined}
              type="button"
              onClick={() => engage(false)}
            >
              CONTINUE SILENT
            </button>
            <button
              className={!mobileVisitor ? "cinema-gate-primary" : undefined}
              type="button"
              onClick={() => engage(true)}
            >
              {mobileVisitor ? "ENABLE AUDIO" : "ENTER WITH AUDIO"}
            </button>
          </div>
          <button className="cinema-gate-skip" type="button" onClick={skipIntro}>
            SKIP HYPERSPACE
          </button>
          <small>
            {mobileVisitor
              ? "AUDIO IS OFF BY DEFAULT ON MOBILE"
              : "SELECT AUDIO BEFORE TRANSIT"}
          </small>
        </div>
      )}
      <div
        className="audio-controls transit-audio-controls"
        hidden={!jumping || !experienceReady || needsEngagement || captureActive}
        aria-label="Hyperspace audio controls"
      >
        <button
          className="audio-toggle"
          type="button"
          data-audio-toggle
          aria-pressed="true"
        >
          AUDIO // ON
        </button>
        <label className="audio-volume-control">
          <span>VOL</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            defaultValue="30"
            aria-label="Hyperspace audio volume"
            data-audio-volume
          />
          <output data-audio-volume-value aria-hidden="true">
            030
          </output>
        </label>
      </div>
      <div className={`space-experience${jumping ? " is-jumping" : " is-landed"}`} aria-label={jumping ? "Hyperspace transit sequence" : "Black Vector fleet command environment"}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </>
  );
}
