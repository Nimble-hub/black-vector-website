import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(projectRoot, "renders");
const outputPath = join(outputDirectory, "black-vector-hyperspace-master-4k60.mp4");
const audioPath = join(
  projectRoot,
  ".source-assets",
  "mix-revisions",
  "hyperspace-jump-theater-19-master.wav",
);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const captureUrl =
  process.env.BV_CAPTURE_URL ??
  "https://blackvector.win/?capture=hyperspace&master=4k60";

const viewportWidth = 1920;
const viewportHeight = 1080;
const outputWidth = 3840;
const outputHeight = 2160;
const framesPerSecond = 60;
const durationSeconds = 21.1;
const frameCount = Math.round(durationSeconds * framesPerSecond);

if (!existsSync(chromePath)) {
  throw new Error(`Chrome was not found at ${chromePath}`);
}
if (!existsSync(audioPath)) {
  throw new Error(
    `The lossless Mix 19 master is missing at ${audioPath}. Run scripts/build-cinematic-audio.ps1 first.`,
  );
}

mkdirSync(outputDirectory, { recursive: true });

async function reservePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a Chrome debugging port.");
  }
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForDebugTarget(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(
          (candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl,
        );
        if (target) return target;
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Chrome did not expose a debugging target in time.");
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolveConnection, rejectConnection) => {
      this.socket.addEventListener("open", resolveConnection, { once: true });
      this.socket.addEventListener(
        "error",
        () => rejectConnection(new Error("Chrome debugging connection failed.")),
        { once: true },
      );
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForCapture(session, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = "page not ready";
  while (Date.now() < deadline) {
    const result = await session.send("Runtime.evaluate", {
      expression: `(() => {
        const canvas = document.querySelector("canvas");
        return {
          ready: window.__BV_CAPTURE_READY__ === true,
          hasRenderHook: typeof window.__BV_CAPTURE_RENDER__ === "function",
          width: canvas?.width ?? 0,
          height: canvas?.height ?? 0,
          href: location.href,
        };
      })()`,
      returnByValue: true,
    });
    const state = result.result?.value;
    lastState = JSON.stringify(state);
    if (
      state?.ready &&
      state?.hasRenderHook &&
      state.width === outputWidth &&
      state.height === outputHeight
    ) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Capture route did not become ready. Last state: ${lastState}`);
}

async function renderFrame(session, timeMilliseconds) {
  const result = await session.send("Runtime.evaluate", {
    expression: `(() => {
      window.__BV_CAPTURE_RENDER__(${timeMilliseconds.toFixed(6)});
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("Capture canvas disappeared.");
      return canvas.toDataURL("image/png");
    })()`,
    returnByValue: true,
  });
  const dataUrl = result.result?.value;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(result.exceptionDetails?.text ?? "Chrome returned an invalid frame.");
  }
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function main() {
  const port = await reservePort();
  const profileDirectory = mkdtempSync(join(tmpdir(), "black-vector-master-"));
  let chrome;
  let ffmpeg;
  let session;

  try {
    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDirectory}`,
        `--window-size=${viewportWidth},${viewportHeight}`,
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-first-run",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-gpu-vsync",
        "--disable-frame-rate-limit",
        "--use-angle=d3d11",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    const target = await waitForDebugTarget(port);
    session = new CdpSession(target.webSocketDebuggerUrl);
    await session.connect();
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewportWidth,
      screenHeight: viewportHeight,
    });
    await session.send("Page.navigate", { url: captureUrl });
    await waitForCapture(session);

    console.log(
      `Rendering ${frameCount} deterministic frames at ${outputWidth}x${outputHeight}, ${framesPerSecond} fps.`,
    );

    const ffmpegArguments = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-framerate",
      String(framesPerSecond),
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-i",
      "pipe:0",
      "-i",
      audioPath,
      "-t",
      String(durationSeconds),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryslow",
      "-crf",
      "8",
      "-profile:v",
      "high",
      "-level:v",
      "5.2",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-x264-params",
      "keyint=120:min-keyint=60:scenecut=40:aq-mode=3:aq-strength=0.85",
      "-c:a",
      "aac",
      "-af",
      "loudnorm=I=-16:TP=-2:LRA=9",
      "-b:a",
      "320k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-metadata",
      "title=Black Vector - Hyperspace Master 4K60",
      outputPath,
    ];

    let ffmpegErrors = "";
    ffmpeg = spawn("ffmpeg", ffmpegArguments, { stdio: ["pipe", "ignore", "pipe"] });
    ffmpeg.stderr.setEncoding("utf8");
    ffmpeg.stderr.on("data", (chunk) => {
      ffmpegErrors = `${ffmpegErrors}${chunk}`.slice(-16_000);
    });

    const startedAt = Date.now();
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timeMilliseconds = (frameIndex * 1000) / framesPerSecond;
      const png = await renderFrame(session, timeMilliseconds);
      if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, "drain");

      if ((frameIndex + 1) % framesPerSecond === 0 || frameIndex + 1 === frameCount) {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const progress = frameIndex + 1;
        const estimatedTotal = (elapsedSeconds / progress) * frameCount;
        const remaining = Math.max(0, estimatedTotal - elapsedSeconds);
        console.log(
          `Captured ${(progress / framesPerSecond).toFixed(1)}s / ${durationSeconds.toFixed(1)}s ` +
            `(about ${Math.ceil(remaining)}s remaining).`,
        );
      }
    }

    ffmpeg.stdin.end();
    const [exitCode] = await once(ffmpeg, "close");
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}.\n${ffmpegErrors}`);
    }
    console.log(`Master written to ${outputPath}`);
  } finally {
    session?.close();
    if (ffmpeg && ffmpeg.exitCode === null) ffmpeg.kill();
    if (chrome && chrome.exitCode === null) chrome.kill();
    const resolvedProfile = resolve(profileDirectory);
    const resolvedTemporaryRoot = resolve(tmpdir());
    if (resolvedProfile.startsWith(`${resolvedTemporaryRoot}\\black-vector-master-`)) {
      try {
        rmSync(resolvedProfile, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 250,
        });
      } catch (error) {
        console.warn(`Chrome profile cleanup was deferred: ${error.message}`);
      }
    }
  }
}

await main();
