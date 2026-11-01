import { describe, expect, it } from "vitest";
import { speechLang } from "../src/lib/speech-lang";

describe("speech language", () => {
  it("knows other scripts", () => {
    expect(speechLang("छाया वाला रास्ता 9 मिनट का है।")).toBe("hi-IN");
    expect(speechLang("最凉快的路线需要9分钟。")).toBe("zh-CN");
    expect(speechLang("日陰のルートは9分です。")).toBe("ja-JP");
    expect(speechLang("그늘 경로는 9분입니다.")).toBe("ko-KR");
    expect(speechLang("المسار المظلل يستغرق 9 دقائق.")).toBe("ar-SA");
  });

  it("tells common Latin-script languages from English", () => {
    expect(
      speechLang("La ruta con más sombra tarda 9 minutos y evita la calle 24."),
    ).toBe("es-ES");
    expect(
      speechLang(
        "Le chemin le plus ombragé prend 9 minutes, c'est par la rue Guadalupe.",
      ),
    ).toBe("fr-FR");
    expect(
      speechLang("Der schattigste Weg dauert 9 Minuten und ist kühler."),
    ).toBe("de-DE");
  });

  it("leaves English and unclear text to the default voice", () => {
    expect(
      speechLang(
        "The shade route takes 9 minutes with 45% shade. It's on the map.",
      ),
    ).toBeNull();
    expect(speechLang("Speedway, 9 min")).toBeNull();
    expect(speechLang("")).toBeNull();
  });
});
