import { describe, expect, it } from "vitest";
import { MESSAGES } from ".";
import { resolveLang } from "./lang";

describe("resolveLang", () => {
  it("follows the OS: any Portuguese gets pt-BR, anything else English", () => {
    expect(resolveLang("auto", "pt-BR")).toBe("pt-BR");
    expect(resolveLang("auto", "pt-PT")).toBe("pt-BR");
    expect(resolveLang("auto", "pt")).toBe("pt-BR");
    expect(resolveLang("auto", "pt_BR")).toBe("pt-BR");
    expect(resolveLang("auto", "en-US")).toBe("en");
    expect(resolveLang("auto", "es-ES")).toBe("en");
    expect(resolveLang("auto", "ptx")).toBe("en");
  });

  it("lets a manual choice win over the OS", () => {
    expect(resolveLang("en", "pt-BR")).toBe("en");
    expect(resolveLang("pt-BR", "en-US")).toBe("pt-BR");
  });
});

describe("translations", () => {
  it("give every English text a non-empty Brazilian one", () => {
    const walk = (en: object, pt: object, path: string) => {
      for (const [k, v] of Object.entries(en)) {
        const other = (pt as Record<string, unknown>)[k];
        const at = `${path}.${k}`;
        if (typeof v === "string") expect(typeof other === "string" && other.trim() !== "", at).toBe(true);
        else if (typeof v === "function") expect(typeof other, at).toBe("function");
        else walk(v as object, other as object, at);
      }
    };
    walk(MESSAGES.en, MESSAGES["pt-BR"], "t");
  });
});
