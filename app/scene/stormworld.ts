import * as THREE from "three";

// This planet is generated independently of the retired ocean/cloud artwork.
// The weather texture describes coverage and height, never baked illumination.
const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, z: number, period = 256): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(ix), x1 = wrap(ix + 1);
  const y0 = wrap(iy), y1 = wrap(iy + 1);
  const z0 = wrap(iz), z1 = wrap(iz + 1);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(
    mix(mix(hash(x0, y0, z0), hash(x1, y0, z0), fx), mix(hash(x0, y1, z0), hash(x1, y1, z0), fx), fy),
    mix(mix(hash(x0, y0, z1), hash(x1, y0, z1), fx), mix(hash(x0, y1, z1), hash(x1, y1, z1), fx), fy), fz,
  );
}

// A handful of deliberately unequal systems, not a tiled field of hurricanes.
const systems = [
  { longitude: 1.94, latitude: 0.35, radius: 0.48, spin: 1, phase: 0.8 },
  { longitude: 1.08, latitude: -0.43, radius: 0.34, spin: -1, phase: 2.4 },
  { longitude: 2.92, latitude: -0.21, radius: 0.26, spin: -1, phase: 4.1 },
  { longitude: 3.55, latitude: 0.32, radius: 0.41, spin: 1, phase: 1.7 },
  { longitude: 4.81, latitude: -0.48, radius: 0.36, spin: -1, phase: 3.2 },
].map((s) => ({
  ...s,
  axis: [Math.cos(s.latitude) * Math.cos(s.longitude), Math.sin(s.latitude), Math.cos(s.latitude) * Math.sin(s.longitude)],
  east: [-Math.sin(s.longitude), 0, Math.cos(s.longitude)],
  north: [-Math.sin(s.latitude) * Math.cos(s.longitude), Math.cos(s.latitude), -Math.sin(s.latitude) * Math.sin(s.longitude)],
}));

export function sampleStormWeather(x: number, y: number, z: number) {
  const broad = noise(x * 3.1 + 12, y * 3.1 + 7, z * 3.1 + 19);
  const medium = noise(x * 12 + 28, y * 12 + 3, z * 12 + 11);
  const fine = noise(x * 38 + 5, y * 38 + 18, z * 38 + 9);
  const front = Math.sin(y * 15 + broad * 6 + x * 2.5 - z * 1.4);
  const belt = smooth(0.08, 0.83, front * 0.26 + broad * 0.7 + medium * 0.22);
  let coverage = clamp((belt - 0.26) * 1.45);
  let tower = coverage * 0.42;
  let activity = 0;
  for (const s of systems) {
    const dot = x * s.axis[0] + y * s.axis[1] + z * s.axis[2];
    if (dot < Math.cos(s.radius * 1.55)) continue;
    const r = Math.acos(Math.max(-1, Math.min(1, dot))) / s.radius;
    const angle = Math.atan2(x * s.north[0] + y * s.north[1] + z * s.north[2], x * s.east[0] + y * s.east[1] + z * s.east[2]);
    const spiral = angle * 3 * s.spin + r * 15 - s.phase + (medium - 0.5) * 2.6;
    const arms = smooth(-0.65, 0.85, Math.sin(spiral)) * (1 - smooth(0.52, 1.5, r));
    const eyewall = Math.exp(-Math.pow((r - 0.145) / 0.085, 2));
    const eye = smooth(0.055, 0.125, r);
    const shield = (1 - smooth(0.18, 0.92, r)) * 0.55;
    const storm = clamp((shield + arms * 0.65 + eyewall * 0.64 + (fine - 0.5) * 0.17) * eye);
    const influence = 1 - smooth(0.7, 1.5, r);
    coverage = coverage * (1 - influence) + Math.max(coverage * 0.42, storm) * influence;
    // Punch a real, clean eye through the whole vertical column.
    coverage *= 1 - (1 - eye) * influence;
    tower = Math.max(tower, (eyewall * 0.8 + storm * 0.5) * eye);
    activity = Math.max(activity, eyewall * eye + arms * 0.3);
  }
  return [clamp(coverage), clamp(0.25 + tower * 0.68 + medium * 0.1), clamp(activity)] as const;
}

function createWeatherTexture(width: number) {
  const height = width / 2;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const latitude = ((row + 0.5) / height - 0.5) * Math.PI;
    for (let col = 0; col < width; col++) {
      const longitude = ((col + 0.5) / width - 0.5) * TAU;
      const weather = sampleStormWeather(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
      const i = (row * width + col) * 4;
      data[i] = Math.round(weather[0] * 255);
      data[i + 1] = Math.round(weather[1] * 255);
      data[i + 2] = Math.round(weather[2] * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createVolumeTexture(size: number) {
  const data = new Uint8Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = noise(x / size * 4, y / size * 4, z / size * 4, 4);
    const b = noise(x / size * 8, y / size * 8, z / size * 8, 8);
    const c = noise(x / size * 16, y / size * 16, z / size * 16, 16);
    data[x + size * (y + size * z)] = Math.round((a * 0.57 + b * 0.29 + c * 0.14) * 255);
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export const stormworldVertexShader = `
  uniform float uRadius;
  varying vec3 vPlanetPosition;
  void main() {
    vPlanetPosition = position / uRadius;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const stormworldFragmentShader = `
  precision highp float;
  precision highp sampler3D;
  uniform sampler2D uWeather;
  uniform sampler3D uVolume;
  uniform vec3 uLocalCamera;
  uniform vec3 uLocalSun;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vPlanetPosition;
  const float PI = 3.14159265359;
  const float CLOUD_BASE = 1.0018;
  const float CLOUD_TOP = 1.014;
  const float AIR_TOP = 1.035;

  vec2 sphereInterval(vec3 origin, vec3 ray, float radius) {
    float b = dot(origin, ray);
    float h = b * b - dot(origin, origin) + radius * radius;
    if (h < 0.0) return vec2(1e5, -1e5);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  vec3 weatherAt(vec3 p) {
    vec3 n = normalize(p);
    vec2 uv = vec2(atan(n.z, n.x) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
    // Slow differential winds: the weather and its shadow use the same field.
    uv.x += uTime * 0.000007 * sin(n.y * 5.0);
    return texture2D(uWeather, uv).rgb;
  }

  float cloudDensity(vec3 p, vec3 weather) {
    float height = (length(p) - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    if (height <= 0.0 || height >= 1.0 || weather.r < 0.025) return 0.0;
    vec3 drift = vec3(uTime * 0.00013, 0.0, -uTime * 0.00009);
    float billow = texture(uVolume, p * 18.0 + drift).r;
    float erosion = texture(uVolume, p * 43.0 - drift * 0.4).r;
    float ceiling = 0.32 + weather.g * 0.6 + (billow - 0.5) * 0.16;
    float profile = smoothstep(0.0, 0.1, height) * (1.0 - smoothstep(ceiling * 0.58, ceiling, height));
    float body = weather.r - (1.0 - billow) * 0.48 - erosion * 0.08;
    return smoothstep(0.01, 0.25, body) * profile;
  }

  float densityAt(vec3 p) { return cloudDensity(p, weatherAt(p)); }

  vec3 oceanRadiance(vec3 p, vec3 ray, vec3 sun) {
    vec3 n = normalize(p);
    float nl = max(dot(n, sun), 0.0);
    float nv = max(dot(n, -ray), 0.001);
    vec3 h = normalize(sun - ray);
    float nh = max(dot(n, h), 0.0);
    float vh = max(dot(-ray, h), 0.0);
    // Broad, physically inspired water glint. No giant painted wave texture.
    float a2 = 0.0064;
    float denom = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / max(PI * denom * denom, 0.0001);
    float fresnel = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
    float geometry = (nv / (nv * 0.87 + 0.13)) * (nl / (nl * 0.87 + 0.13));
    float glint = distribution * fresnel * geometry / max(4.0 * nv * nl, 0.01);
    float currents = texture(uVolume, n * 2.7).r;
    vec3 water = mix(vec3(0.002, 0.009, 0.024), vec3(0.007, 0.04, 0.068), currents);
    float shadow = 1.0;
    if (nl > 0.0) {
      float travel = (CLOUD_BASE + 0.004 - 1.0) / max(nl, 0.18);
      shadow = exp(-densityAt(p + sun * travel) * 2.4);
    }
    return water * (0.025 + nl * 1.6) + vec3(1.45, 1.34, 1.16) * min(glint, 3.0) * nl * shadow;
  }

  float sheetLightning(vec3 p, vec3 weather) {
    vec3 cell = floor(normalize(p) * 58.0);
    float seed = fract(sin(dot(cell, vec3(17.17, 47.71, 113.53))) * 43758.5453);
    float cycle = uTime / (9.0 + seed * 12.0) + seed * 43.0;
    float event = fract(sin(seed * 731.0 + floor(cycle) * 91.7) * 31741.31);
    float phase = fract(cycle);
    float flash = exp(-pow((phase - 0.16) * 280.0, 2.0)) + exp(-pow((phase - 0.179) * 360.0, 2.0)) * 0.35;
    vec3 local = fract(normalize(p) * 58.0) - 0.5;
    return flash * step(0.986, event) * exp(-dot(local, local) * 18.0) * weather.b;
  }

  void main() {
    vec3 ray = normalize(vPlanetPosition - uLocalCamera);
    vec3 sun = normalize(uLocalSun);
    vec2 ground = sphereInterval(uLocalCamera, ray, 1.0);
    bool hitsGround = ground.x > 0.0 && ground.y > ground.x;
    vec3 groundPoint = uLocalCamera + ray * ground.x;
    vec3 result = hitsGround ? oceanRadiance(groundPoint, ray, sun) : vec3(0.0);
    float alpha = hitsGround ? 1.0 : 0.0;

    vec2 clouds = sphereInterval(uLocalCamera, ray, CLOUD_TOP);
    vec2 base = sphereInterval(uLocalCamera, ray, CLOUD_BASE);
    float start = max(clouds.x, 0.0);
    float end = clouds.y;
    if (base.x > start && base.y > base.x) end = min(end, base.x);
    if (hitsGround) end = min(end, ground.x);
    if (end > start) {
      float stride = (end - start) / float(CLOUD_STEPS);
      // Spatially fixed stratification avoids moving screen-space grain.
      float jitter = fract(dot(gl_FragCoord.xy, vec2(0.75487766, 0.56984029))) * 0.5 + 0.25;
      float transmission = 1.0;
      vec3 scattering = vec3(0.0);
      float phase = 0.75 + pow(max(dot(ray, sun), 0.0), 6.0) * 1.6;
      for (int i = 0; i < CLOUD_STEPS; i++) {
        vec3 p = uLocalCamera + ray * (start + (float(i) + jitter) * stride);
        vec3 weather = weatherAt(p);
        float density = cloudDensity(p, weather);
        if (density > 0.002) {
          float sunHeight = dot(normalize(p), sun);
          float daylight = smoothstep(-0.065, 0.14, sunHeight);
          float shadowDensity = densityAt(p + sun * 0.003) * 0.65;
          #if SHADOW_STEPS > 1
            shadowDensity += densityAt(p + sun * 0.008) * 0.35;
          #endif
          float sunlight = exp(-shadowDensity * 3.8) * daylight;
          float height = clamp((length(p) - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
          vec3 ambient = mix(vec3(0.035, 0.065, 0.12), vec3(0.19, 0.27, 0.38), height) * daylight + vec3(0.0006, 0.0013, 0.003);
          vec3 source = ambient + vec3(1.55, 1.47, 1.32) * sunlight * phase;
          source += vec3(1.15, 1.38, 1.8) * sheetLightning(p, weather) * (1.0 - daylight * 0.75) * 7.0;
          float absorption = 1.0 - exp(-density * stride * 300.0);
          scattering += source * transmission * absorption;
          transmission *= 1.0 - absorption;
          if (transmission < 0.015) break;
        }
      }
      result = scattering + result * transmission;
      alpha = (1.0 - transmission) + alpha * transmission;
    }

    // Integrate a thin spherical atmosphere, including the real horizon path.
    vec2 air = sphereInterval(uLocalCamera, ray, AIR_TOP);
    float airEnd = hitsGround ? min(air.y, ground.x) : air.y;
    float airStart = max(air.x, 0.0);
    if (airEnd > airStart) {
      float stride = (airEnd - airStart) / 6.0;
      vec3 airLight = vec3(0.0);
      float airDepth = 0.0;
      float rayleighPhase = 0.75 * (1.0 + pow(dot(ray, sun), 2.0));
      for (int i = 0; i < 6; i++) {
        vec3 p = uLocalCamera + ray * (airStart + (float(i) + 0.5) * stride);
        float height = max(length(p) - 1.0, 0.0);
        float density = exp(-height / 0.0045);
        vec2 planetShadow = sphereInterval(p, sun, 1.0);
        float day = planetShadow.x > 0.0 && planetShadow.y > planetShadow.x ? 0.0 : 1.0;
        float sunElevation = dot(normalize(p), sun);
        vec3 tint = mix(vec3(0.48, 0.19, 0.08), vec3(0.11, 0.33, 0.86), smoothstep(-0.01, 0.22, sunElevation));
        float depth = density * stride * 13.0;
        airLight += tint * depth * day * rayleighPhase;
        airDepth += depth;
      }
      float transmission = exp(-airDepth);
      result = result * transmission + airLight;
      alpha = 1.0 - (1.0 - alpha) * transmission;
    }
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(result / max(alpha, 0.001), alpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createStormworld(radius: number, mobile: boolean, balanced: boolean, software: boolean) {
  const economical = mobile || software;
  const weather = createWeatherTexture(economical ? 512 : 1024);
  const volume = createVolumeTexture(economical ? 32 : 64);
  const uniforms = {
    uRadius: { value: radius },
    uLocalCamera: { value: new THREE.Vector3() },
    uLocalSun: { value: new THREE.Vector3() },
    uWeather: { value: weather },
    uVolume: { value: volume },
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    defines: { CLOUD_STEPS: economical ? 12 : balanced ? 20 : 28, SHADOW_STEPS: economical ? 1 : 2 },
    vertexShader: stormworldVertexShader,
    fragmentShader: stormworldFragmentShader,
    transparent: true,
    depthWrite: true,
    toneMapped: true,
  });
  const geometry = new THREE.SphereGeometry(radius * 1.035, economical ? 80 : 128, economical ? 48 : 80);
  const planet = new THREE.Mesh(geometry, material);
  planet.name = "Stormworld — procedural ocean / cloud volume / atmosphere";
  planet.rotation.set(-0.08, 0.12, 0.04);
  const inverseWorld = new THREE.Matrix4();
  const sunWorld = new THREE.Vector3(-14, 18, 9).normalize();
  planet.onBeforeRender = (_renderer, _scene, camera) => {
    inverseWorld.copy(planet.matrixWorld).invert();
    uniforms.uLocalCamera.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverseWorld).divideScalar(radius);
    uniforms.uLocalSun.value.copy(sunWorld).transformDirection(inverseWorld);
    material.uniformsNeedUpdate = true;
  };
  return {
    planet, geometry, material, textures: [weather, volume],
    setOpacity: (opacity: number) => { uniforms.uOpacity.value = clamp(opacity); },
    update: (seconds: number) => {
      uniforms.uTime.value = seconds;
      planet.rotation.y = 0.12 + seconds * 0.0012;
    },
  };
}
