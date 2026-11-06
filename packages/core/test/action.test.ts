import { describe, expect, it } from "vitest";
import { InvalidNewsroomNameError, actionFor, isNewsroomName } from "../src/index.ts";

describe("RN-09 proof action: submit:<newsroom>:<epoch>", () => {
  it("formats_submit_newsroom_epoch", () => {
    expect(actionFor("investiga.jornal.eth", 202611)).toBe("submit:investiga.jornal.eth:202611");
  });

  it("different_newsrooms_generate_different_actions", () => {
    expect(actionFor("a.eth", 202611)).not.toBe(actionFor("b.eth", 202611));
  });

  it("different_epochs_generate_different_actions", () => {
    expect(actionFor("a.eth", 202611)).not.toBe(actionFor("a.eth", 202612));
  });

  it("rejects_invalid_newsroom_name", () => {
    for (const bad of ["", "Investiga.eth", "a..eth", "-a.eth", "a.com", "a b.eth", "submit:x.eth", ".eth"]) {
      expect(() => actionFor(bad, 202611), bad).toThrow(InvalidNewsroomNameError);
    }
  });

  it("rejects_invalid_epoch", () => {
    expect(() => actionFor("a.eth", 202613)).toThrow(RangeError);
  });

  it("isNewsroomName_accepts_lowercase_eth_names_and_subnames", () => {
    expect(isNewsroomName("jornal.eth")).toBe(true);
    expect(isNewsroomName("investiga.jornal.eth")).toBe(true);
    expect(isNewsroomName("a-b.c1.eth")).toBe(true);
    expect(isNewsroomName("JORNAL.eth")).toBe(false);
  });
});
