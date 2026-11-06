import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scanText } from "../../guardrails/patterns.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

type Pkg = { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

function workspacePackages(root: string): { dir: string; pkg: Pkg }[] {
  const out: { dir: string; pkg: Pkg }[] = [];
  for (const group of ["packages", "apps"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const file = join(base, name, "package.json");
      if (existsSync(file)) out.push({ dir: `${group}/${name}`, pkg: JSON.parse(readFileSync(file, "utf8")) as Pkg });
    }
  }
  return out;
}

/** Dependency names (from all package.json files) that the guardrail recognizes as an anonymity network. */
function forbiddenDependencies(root: string): string[] {
  const files = [join(root, "package.json"), ...workspacePackages(root).map((p) => join(root, p.dir, "package.json"))];
  const hits: string[] = [];
  for (const file of files) {
    const pkg = JSON.parse(readFileSync(file, "utf8")) as Pkg;
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    for (const n of names) if (scanText(n).length > 0) hits.push(`${file}: ${n}`);
  }
  return hits;
}

describe("RNF-05 dependency guardrail", () => {
  it("no_monorepo_package_json_has_anonymity_network_package", () => {
    expect(forbiddenDependencies(ROOT)).toEqual([]);
  });

  it("detects_a_forbidden_package_when_it_appears", () => {
    const dir = mkdtempSync(join(tmpdir(), "sw-"));
    mkdirSync(join(dir, "packages/x"), { recursive: true });
    // The name is assembled in parts so the test itself does not trigger the repository guardrail.
    const forbidden = "to" + "r-js";
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "r" }));
    writeFileSync(join(dir, "packages/x/package.json"), JSON.stringify({ name: "x", dependencies: { [forbidden]: "1.0.0" } }));
    expect(forbiddenDependencies(dir)).toHaveLength(1);
  });
});

describe("dependency rules between packages", () => {
  // Who can depend on whom (docs/03-components.md §3). No arrow points back.
  const allowed: Record<string, string[]> = {
    "@safe-whistle/core": [],
    "@safe-whistle/crypto": ["@safe-whistle/core"],
    "@safe-whistle/network-policy": ["@safe-whistle/core"],
    "@safe-whistle/ens-client": ["@safe-whistle/core", "@safe-whistle/network-policy"],
    "@safe-whistle/arkiv-store": ["@safe-whistle/core", "@safe-whistle/network-policy"],
    "@safe-whistle/worldid-gate": ["@safe-whistle/core", "@safe-whistle/network-policy"],
    "@safe-whistle/source-client": ["@safe-whistle/core", "@safe-whistle/crypto", "@safe-whistle/ens-client", "@safe-whistle/network-policy"],
    "@safe-whistle/newsroom-client": ["@safe-whistle/core", "@safe-whistle/crypto", "@safe-whistle/ens-client", "@safe-whistle/arkiv-store", "@safe-whistle/network-policy"],
    "@safe-whistle/relayer": ["@safe-whistle/core", "@safe-whistle/crypto", "@safe-whistle/ens-client", "@safe-whistle/arkiv-store", "@safe-whistle/worldid-gate", "@safe-whistle/network-policy"],
    // The screen is the composition root: it wires real ENS and Arkiv to the client; the logic lives in source-client.
    "@safe-whistle/web-source": ["@safe-whistle/source-client", "@safe-whistle/core", "@safe-whistle/ens-client", "@safe-whistle/arkiv-store", "@safe-whistle/network-policy"],
    "@safe-whistle/web-newsroom": ["@safe-whistle/newsroom-client", "@safe-whistle/core", "@safe-whistle/ens-client", "@safe-whistle/arkiv-store", "@safe-whistle/network-policy"],
  };

  it("each_package_only_depends_on_what_the_rule_allows", () => {
    for (const { dir, pkg } of workspacePackages(ROOT)) {
      const name = pkg.name ?? dir;
      const internal = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => d.startsWith("@safe-whistle/"));
      expect(allowed[name], `package without rule: ${name}`).toBeDefined();
      for (const dep of internal) expect(allowed[name], `${name} cannot depend on ${dep}`).toContain(dep);
    }
  });

  it("core_and_crypto_do_not_depend_on_network_packages", () => {
    for (const name of ["@safe-whistle/core", "@safe-whistle/crypto"]) {
      expect(allowed[name]).not.toContain("@safe-whistle/network-policy");
    }
  });
});

describe("ci script", () => {
  it("runs_the_steps_in_order_and_starts_with_the_guardrail", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const steps = pkg.scripts.ci!.split("&&").map((s) => s.trim());
    expect(steps[0]).toBe("npm run guardrails");
    const idx = (s: string) => steps.indexOf(s);
    expect(idx("npm run guardrails")).toBeLessThan(idx("npm run typecheck"));
    expect(idx("npm run typecheck")).toBeLessThan(idx("npm run test:coverage"));
  });

  it("the_scripts_do_not_use_an_automated_browser", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
    const all = JSON.stringify(pkg).toLowerCase();
    for (const banned of ["playwright", "puppeteer", "selenium"]) expect(all).not.toContain(banned);
  });
});
