// Deterministic local Chrome rasterization; isolated profile, no external I/O.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "./chromium-pipe.js";
import { MURMINGLE_PATH } from "../browser/chromium/murmingle-geometry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "browser/chromium/icons");
const svg = await readFile(path.join(icons, "murmingle.svg"), "utf8");
assert.equal(svg.match(/ d="([^"]+)"/u)?.[1], MURMINGLE_PATH, "SVG and Canvas geometry agree");
const geometry = (await readFile(path.join(root, "browser/chromium/murmingle-geometry.js"), "utf8"))
  .replaceAll("export ", "");
const profileRoot = await mkdtemp(path.join(os.tmpdir(), "murmingle-icons-"));
let browser;
try {
  browser = launchChromiumPipe({
    executable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    profileDirectory: path.join(profileRoot, "profile"),
  });
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const result = await browser.send("Runtime.evaluate", {
    expression: `(async () => {
      ${geometry}
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      await image.decode();
      const results = [];
      for (const size of [16, 24, 28, 32, 48, 128]) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, size, size);
        const svgPixels = ctx.getImageData(0, 0, size, size).data;
        const native = new OffscreenCanvas(size, size); const painter = native.getContext('2d');
        painter.scale(size / 32, size / 32); painter.fillStyle = '#aeb5ff';
        traceMurmingle(painter); painter.fill('evenodd');
        const canvasPixels = painter.getImageData(0, 0, size, size).data;
        let alphaDifference = 0; let solid = 0;
        for (let i = 3; i < svgPixels.length; i += 4) {
          alphaDifference = Math.max(alphaDifference, Math.abs(svgPixels[i] - canvasPixels[i]));
          if (svgPixels[i] > 240) solid++;
        }
        const alpha = (x, y) => svgPixels[(y * size + x) * 4 + 3];
        const center = alpha(Math.floor(size / 2), Math.floor(size / 2));
        const left = alpha(Math.floor(size * .22), Math.floor(size * .48));
        const right = alpha(Math.floor(size * .78), Math.floor(size * .52));
        // Native Chrome frames need the approved dark rounded-square backplate.
        // SVG/header and state-colored Canvas remain transparent.
        ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#141519';
        ctx.beginPath(); ctx.roundRect(0, 0, size, size, size * .18); ctx.fill();
        results.push({size, png: canvas.toDataURL('image/png').split(',')[1], alphaDifference,
          center, left, right, solid});
      }
      return results;
    })()`, awaitPromise: true, returnByValue: true,
  }, sessionId);
  assert.equal(result.exceptionDetails, undefined, "Chrome rasterization succeeds");
  for (const icon of result.result.value) {
    assert.equal(icon.center, 0, `transparent shared center at ${icon.size}px`);
    assert.ok(icon.left > 240 && icon.right > 240, `both bubbles visible at ${icon.size}px`);
    assert.ok(icon.solid > icon.size * icon.size / 5, "substantial filled silhouette");
    assert.ok(icon.alphaDifference <= 1, "SVG and dynamic Canvas raster agree");
    if ([16, 32, 48, 128].includes(icon.size)) {
      await writeFile(path.join(icons, `murmingle-${icon.size}.png`), Buffer.from(icon.png, "base64"));
    }
    console.log(`Chrome ${icon.size}px: clear center, both bubbles, SVG/Canvas alpha delta ${icon.alphaDifference}`);
  }
} finally {
  await browser?.close();
  // Only the unique disposable profile created by this process.
  assert.equal(path.dirname(path.resolve(profileRoot)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(profileRoot).startsWith("murmingle-icons-"));
  await rm(profileRoot, { recursive: true, force: true });
}
