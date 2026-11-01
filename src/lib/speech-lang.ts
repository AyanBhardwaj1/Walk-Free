/**
 * A best guess at the language of a short reply, as a BCP 47 tag for
 * speech, so a Spanish or Hindi answer isn't read with an English voice.
 * Scripts decide most cases; Latin-script languages need a few telltale
 * words or letters. Returns null when it can't tell (use the default voice).
 */
export function speechLang(text: string): string | null {
  if (/[ऀ-ॿ]/.test(text)) return "hi-IN";
  if (/[぀-ヿ]/.test(text)) return "ja-JP";
  if (/[가-힯]/.test(text)) return "ko-KR";
  if (/[一-鿿]/.test(text)) return "zh-CN";
  if (/[؀-ۿ]/.test(text)) return "ar-SA";
  if (/[Ѐ-ӿ]/.test(text)) return "ru-RU";
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  const score = (list: string[]) =>
    words.filter((w) => list.includes(w)).length;
  const es =
    score([
      "el",
      "la",
      "los",
      "las",
      "es",
      "para",
      "por",
      "con",
      "más",
      "minutos",
      "sombra",
      "calle",
      "ruta",
      "hacia",
      "una",
      "que",
    ]) + (/[¿¡ñ]/.test(text) ? 3 : 0);
  const fr =
    score([
      "le",
      "les",
      "des",
      "est",
      "pour",
      "avec",
      "plus",
      "ombre",
      "rue",
      "une",
      "vers",
      "que",
    ]) + (/[çœ]|\b(c'est|l'|d')/.test(text) ? 2 : 0);
  const pt =
    score([
      "o",
      "os",
      "as",
      "para",
      "com",
      "mais",
      "sombra",
      "rua",
      "uma",
      "você",
    ]) + (/[ãõ]/.test(text) ? 3 : 0);
  const de =
    score([
      "der",
      "die",
      "das",
      "und",
      "ist",
      "mit",
      "für",
      "schatten",
      "straße",
      "minuten",
    ]) + (/[äöüß]/.test(text) ? 2 : 0);
  const en = score([
    "the",
    "and",
    "is",
    "to",
    "with",
    "minutes",
    "shade",
    "street",
    "route",
    "it's",
    "of",
  ]);
  const best = Object.entries({
    "es-ES": es,
    "fr-FR": fr,
    "pt-BR": pt,
    "de-DE": de,
  }).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 && best[1] > en ? best[0] : null;
}
