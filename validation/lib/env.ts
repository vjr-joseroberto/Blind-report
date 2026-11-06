import { readFileSync } from "node:fs";

/** Reads the root .env (without printing anything). */
export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const path = new URL("../../.env", import.meta.url).pathname;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
