import { isEpoch } from "./epoch.ts";

export class InvalidNewsroomNameError extends Error {
  constructor(name: string) {
    super(`Invalid newsroom name: "${name}"`);
    this.name = "InvalidNewsroomNameError";
  }
}

const NEWSROOM_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+eth$/;

/** Lowercase ENS name ending in .eth (names and subnames). */
export function isNewsroomName(name: string): boolean {
  return NEWSROOM_RE.test(name);
}

/** World ID proof action: `submit:<newsroom>:<epoch>`. */
export function actionFor(newsroom: string, epoch: number): string {
  if (!isNewsroomName(newsroom)) throw new InvalidNewsroomNameError(newsroom);
  if (!isEpoch(epoch)) throw new RangeError(`Invalid epoch: ${epoch}`);
  return `submit:${newsroom}:${epoch}`;
}
