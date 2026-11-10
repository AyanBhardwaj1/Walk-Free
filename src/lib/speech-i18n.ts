/**
 * Spoken walking guidance in more than English: the few phrases the
 * walking directions are made of ("Turn left onto …", "Shade in 50
 * metres.", "You have arrived."), in the languages below. Street and
 * building names are said as they are mapped.
 */

export const SPOKEN_LANGS = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "pt-BR", label: "Português" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "zh-CN", label: "中文" },
] as const;
export type SpokenLang = (typeof SPOKEN_LANGS)[number]["code"];

type Phrases = {
  head: string;
  around: string;
  right: string;
  left: string;
  along: string;
  /** The footpath, the street, the path. */
  generic: Record<"footpath" | "street" | "path", string>;
  shadeNow: string;
  shadeIn: (m: number) => string;
  arrived: string;
};

const PHRASES: Record<Exclude<SpokenLang, "en-US">, Phrases> = {
  "es-ES": {
    head: "Siga por",
    around: "Dé la vuelta hacia",
    right: "Gire a la derecha hacia",
    left: "Gire a la izquierda hacia",
    along: "Continúe por",
    generic: { footpath: "el sendero", street: "la calle", path: "el camino" },
    shadeNow: "Sombra justo delante.",
    shadeIn: (m) => `Sombra en ${m} metros.`,
    arrived: "Ha llegado.",
  },
  "fr-FR": {
    head: "Suivez",
    around: "Faites demi-tour vers",
    right: "Tournez à droite sur",
    left: "Tournez à gauche sur",
    along: "Continuez sur",
    generic: { footpath: "le sentier", street: "la rue", path: "le chemin" },
    shadeNow: "De l'ombre juste devant.",
    shadeIn: (m) => `De l'ombre dans ${m} mètres.`,
    arrived: "Vous êtes arrivé.",
  },
  "pt-BR": {
    head: "Siga por",
    around: "Faça o retorno para",
    right: "Vire à direita em",
    left: "Vire à esquerda em",
    along: "Continue por",
    generic: { footpath: "a trilha", street: "a rua", path: "o caminho" },
    shadeNow: "Sombra logo à frente.",
    shadeIn: (m) => `Sombra em ${m} metros.`,
    arrived: "Você chegou.",
  },
  "hi-IN": {
    head: "आगे चलें",
    around: "वापस मुड़ें",
    right: "दाएँ मुड़ें",
    left: "बाएँ मुड़ें",
    along: "सीधे चलते रहें",
    generic: { footpath: "पैदल रास्ता", street: "सड़क", path: "रास्ता" },
    shadeNow: "ठीक आगे छाया है।",
    shadeIn: (m) => `${m} मीटर में छाया है।`,
    arrived: "आप पहुँच गए हैं।",
  },
  "zh-CN": {
    head: "沿着",
    around: "掉头进入",
    right: "右转进入",
    left: "左转进入",
    along: "继续沿着",
    generic: { footpath: "人行小路", street: "街道", path: "小路" },
    shadeNow: "前方就有树荫。",
    shadeIn: (m) => `${m} 米后有树荫。`,
    arrived: "您已到达。",
  },
};

const MOVES: [RegExp, keyof Phrases][] = [
  [/^Head along /, "head"],
  [/^Turn around onto /, "around"],
  [/^Turn right onto /, "right"],
  [/^Turn left onto /, "left"],
  [/^Continue along /, "along"],
];

/**
 * A spoken line of guidance in another language: the instruction, then
 * any shade hint. English, or text it doesn't recognise, is left as is.
 */
export function translateGuidance(text: string, lang: string): string {
  const p = PHRASES[lang as keyof typeof PHRASES];
  if (!p) return text;
  if (/^You have arrived\.?$/.test(text.trim())) return p.arrived;
  // "Turn left onto Speedway. Shade in 50 metres." → instruction + hint.
  const hint = text.match(/\s(Shade just ahead\.|Shade in (\d+) metres\.)$/);
  let rest = hint ? text.slice(0, hint.index) : text;
  let said = rest;
  for (const [re, key] of MOVES)
    if (re.test(rest)) {
      rest = rest.replace(re, "").replace(/\.$/, "");
      const generic = rest.match(/^the (footpath|street|path)$/i);
      const place = generic
        ? p.generic[generic[1].toLowerCase() as "footpath" | "street" | "path"]
        : rest;
      said = `${p[key] as string} ${place}.`;
      break;
    }
  const shade = hint ? (hint[2] ? p.shadeIn(Number(hint[2])) : p.shadeNow) : "";
  return shade ? `${said} ${shade}` : said;
}

/**
 * Text split into sentences for speaking one after another: smoother
 * pauses, and long replies aren't cut off (some browsers stop a single
 * utterance after about 15 seconds).
 */
export function speechChunks(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      out.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
