/** A video format this browser can record, preferring small WebM. */
export function recordingType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ])
    if (MediaRecorder.isTypeSupported(type)) return type;
  return null;
}

/**
 * Records the 3D view as a captioned video until `done()` says so (or
 * `maxMs` passes): each animation frame draws a fresh render with the
 * caption into a 2D canvas, whose stream is recorded.
 */
export function recordTimelapse({
  frame,
  caption,
  done,
  maxMs = 30_000,
  width = 1280,
}: {
  /** Renders the scene now and returns its canvas. */
  frame: () => HTMLCanvasElement;
  /** The line to show, read on every frame (place and time). */
  caption: () => string;
  done: () => boolean;
  maxMs?: number;
  width?: number;
}): Promise<{ blob: Blob; type: string }> {
  const type = recordingType();
  if (!type) return Promise.reject(new Error("unsupported"));
  const first = frame();
  const scale = Math.min(1, width / first.width);
  const out = document.createElement("canvas");
  // Even sizes: some encoders refuse odd ones.
  out.width = Math.round((first.width * scale) / 2) * 2;
  out.height = Math.round((first.height * scale) / 2) * 2;
  // Some browsers only send frames from a canvas that is in the page.
  out.setAttribute("aria-hidden", "true");
  out.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.append(out);
  const ctx = out.getContext("2d")!;
  const stream = out.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: type,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const started = performance.now();
  const k = Math.max(1, out.width / 1200);
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      out.remove();
      if (!chunks.length) reject(new Error("empty"));
      else resolve({ blob: new Blob(chunks, { type }), type });
    };
    recorder.onerror = () => {
      out.remove();
      reject(new Error("recorder"));
    };
    const draw = () => {
      ctx.fillStyle = "#e5e1d5";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(frame(), 0, 0, out.width, out.height);
      const line = caption();
      ctx.font = `600 ${18 * k}px "DM Sans", system-ui, sans-serif`;
      const w = ctx.measureText(line).width + 36 * k;
      ctx.fillStyle = "rgba(23, 36, 27, 0.8)";
      ctx.fillRect(18 * k, out.height - 70 * k, w, 52 * k);
      ctx.fillStyle = "#f4f1e6";
      ctx.fillText(line, 36 * k, out.height - 37 * k);
      ctx.font = `600 ${14 * k}px "DM Sans", system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText("walk-free", out.width - 24 * k, out.height - 37 * k);
      ctx.textAlign = "left";
      if (done() || performance.now() - started > maxMs) {
        // One last frame, then stop.
        setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 300);
        return;
      }
      requestAnimationFrame(draw);
    };
    recorder.start(250);
    draw();
  });
}
