/**
 * "My week in the shade": a square image of a week's walking to share,
 * drawn on a canvas from the weekly sun figures (nothing leaves the device
 * unless the walker shares it).
 */

export interface WeekCard {
  /** The map's name, e.g. "UT Austin, TX". */
  place: string;
  walks: number;
  minutes: number;
  sunMinutes: number;
  /** Sun avoided against the quickest ways, when compared. */
  avoided?: { walks: number; minutes: number } | null;
  /** Days in a row with a walk, when it's a streak (2 or more). */
  streak?: number;
}

/** The card's words, also used as the share text and the image's alt. */
export function weekCardText(c: WeekCard) {
  const shade = c.minutes > 0 ? 1 - c.sunMinutes / c.minutes : 0;
  const avoided =
    c.avoided && c.avoided.walks > 0 && c.avoided.minutes >= 1
      ? Math.round(c.avoided.minutes)
      : null;
  const headline =
    avoided !== null
      ? `${avoided} min less sun`
      : `${Math.round(shade * 100)}% in shade`;
  const sub =
    avoided !== null
      ? `than the quickest ways, over ${c.avoided!.walks} walk${c.avoided!.walks === 1 ? "" : "s"}`
      : `of ${Math.round(c.minutes)} walking minutes`;
  const line = `${c.walks} walk${c.walks === 1 ? "" : "s"} · ${Math.round(c.minutes)} min · ${Math.round(shade * 100)}% in shade${c.streak && c.streak >= 2 ? ` · ${c.streak} days in a row` : ""}`;
  return {
    title: "My week in the shade",
    headline,
    sub,
    line,
    place: c.place,
    share: `My week in the shade around ${c.place}: ${headline} ${sub}. Found with Walk-Free.`,
  };
}

/** Words wrapped to a width, at most `max` lines. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  max: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

/** Draws the card on a square canvas (1080 px is a good size). */
export function drawWeekCard(canvas: HTMLCanvasElement, c: WeekCard) {
  const t = weekCardText(c);
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return t;
  const u = size / 1080;
  const serif = `"Playfair Display", Georgia, serif`;
  const sans = `"DM Sans", system-ui, sans-serif`;
  // Ivory paper, a deep green band, and a sun-to-shade bar.
  ctx.fillStyle = "#f5f3ec";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#22301f";
  ctx.fillRect(0, 0, size, 300 * u);
  ctx.fillStyle = "#e9e3c4";
  ctx.font = `600 ${30 * u}px ${sans}`;
  ctx.fillText("WALK-FREE", 80 * u, 110 * u);
  ctx.fillStyle = "#fffdf6";
  ctx.font = `400 ${64 * u}px ${serif}`;
  ctx.fillText(t.title, 80 * u, 210 * u);
  ctx.fillStyle = "#22301f";
  ctx.font = `400 ${120 * u}px ${serif}`;
  wrap(ctx, t.headline, 920 * u, 2).forEach((l, i) =>
    ctx.fillText(l, 80 * u, (470 + i * 130) * u),
  );
  ctx.fillStyle = "#46513d";
  ctx.font = `400 ${40 * u}px ${sans}`;
  wrap(ctx, t.sub, 920 * u, 2).forEach((l, i) =>
    ctx.fillText(l, 80 * u, (560 + i * 54) * u),
  );
  // Shade share as a bar: green shade, amber sun.
  const shade = c.minutes > 0 ? Math.max(0, 1 - c.sunMinutes / c.minutes) : 0;
  const barY = 720 * u,
    barW = 920 * u,
    barH = 28 * u;
  ctx.fillStyle = "#d9a441";
  ctx.fillRect(80 * u, barY, barW, barH);
  ctx.fillStyle = "#3f5938";
  ctx.fillRect(80 * u, barY, barW * shade, barH);
  ctx.fillStyle = "#46513d";
  ctx.font = `400 ${34 * u}px ${sans}`;
  // The stats wrap to a second line if they must; the place follows.
  const lines = wrap(ctx, t.line, 920 * u, 2);
  lines.forEach((l, i) => ctx.fillText(l, 80 * u, (810 + i * 46) * u));
  ctx.fillText(t.place, 80 * u, (870 + (lines.length - 1) * 46) * u);
  ctx.fillStyle = "#3f5938";
  ctx.font = `600 ${32 * u}px ${sans}`;
  ctx.fillText("walk-free.vercel.app", 80 * u, 990 * u);
  return t;
}

/**
 * Shares the card as an image where the device can (the phone's share
 * sheet), else downloads it. Resolves to what happened.
 */
export async function shareWeekCard(
  c: WeekCard,
): Promise<"shared" | "downloaded" | "cancelled"> {
  // Drawn and encoded before anything is awaited, so the share sheet still
  // counts as a response to the tap (Safari refuses it otherwise). The
  // app's own fonts have long loaded by the time this is tapped.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1080;
  const t = drawWeekCard(canvas, c);
  // Encoded at once (toBlob's callback can stall on some software-rendered
  // canvases), then turned into a file.
  const data = canvas.toDataURL("image/png").split(",")[1] ?? "";
  if (!data) return "cancelled";
  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });
  const file = new File([blob], "walk-free-week.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t.title, text: t.share });
      return "shared";
    } catch (e) {
      // Closing the share sheet isn't an error worth reporting.
      if (e instanceof DOMException && e.name === "AbortError")
        return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
