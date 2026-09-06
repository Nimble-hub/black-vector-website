import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("procedural stormworld has bounded global weather, open eyes, and deterministic resources", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import * as THREE from 'three';
    import { createStormworld, sampleStormWeather } from './app/scene/stormworld.ts';
    let clear = 0, dense = 0;
    for (let i = 0; i < 2000; i++) {
      const y = 1 - 2 * (i + 0.5) / 2000, a = i * 2.39996322973, r = Math.sqrt(1-y*y);
      const p = [Math.cos(a)*r,y,Math.sin(a)*r];
      const values = sampleStormWeather(...p);
      assert.ok(values.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
      assert.deepEqual(values, sampleStormWeather(...p));
      clear += values[0] < 0.15 ? 1 : 0;
      dense += values[0] > 0.6 ? 1 : 0;
    }
    assert.ok(clear > 200 && dense > 200, 'Keep ocean openings and substantial storm coverage');
    for (const [lon,lat] of [[1.94,.35],[1.08,-.43]]) {
      const eye=sampleStormWeather(Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon));
      assert.ok(eye[0]<.05, 'The hurricane eye must remain open');
    }
    const world = createStormworld(18, true, false, true);
    assert.equal(world.material.defines.CLOUD_STEPS, 12);
    assert.equal(world.material.defines.SHADOW_STEPS, 1);
    assert.equal(world.textures.length,2);
    assert.equal(world.textures[1].isData3DTexture,true);
    assert.equal(world.textures[1].wrapR,THREE.RepeatWrapping);
    assert.equal(world.textures[0].image.width,512);
    world.setOpacity(2);
    assert.equal(world.material.uniforms.uOpacity.value,1);
    world.setOpacity(-1);
    assert.equal(world.material.uniforms.uOpacity.value,0);
    world.update(10);
    assert.equal(world.material.uniforms.uTime.value,10);
    const camera=new THREE.PerspectiveCamera();
    camera.position.set(0,0,60);camera.updateMatrixWorld();
    world.planet.position.set(14,.8,-58);world.planet.updateMatrixWorld();
    world.planet.onBeforeRender(null,null,camera);
    assert.ok(world.material.uniforms.uLocalCamera.value.length()>1.035);
    assert.ok(Math.abs(world.material.uniforms.uLocalSun.value.length()-1)<1e-10);
    world.geometry.dispose();world.material.dispose();world.textures.forEach(t=>t.dispose());
  `], { cwd: fileURLToPath(root), encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});

test("planet rebuild replaces the old textured shell stack and participates in cleanup", async () => {
  const source = await readFile(new URL("app/hyperspace-intro.tsx", root), "utf8");
  assert.match(source, /createStormworld\(planetRadius, isMobile, balancedQuality, softwareRendering\)/);
  assert.doesNotMatch(source, /bv-abyssal-ocean|bv-planetary-storm-cloud|createStormLayer|stormCloudFragmentShader/);
  assert.match(source, /textures\.push\(\.\.\.stormworld\.textures\)/);
  assert.match(source, /geometries\.push\(stormworld\.geometry\)/);
  assert.match(source, /materials\.push\(stormworld\.material\)/);
  assert.match(source, /stormworld\.setOpacity\(eased\)/);
});
