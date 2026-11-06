import { isEpoch } from "./epoch.ts";

export class InvalidNewsroomNameError extends Error {
  constructor(name: string) {
    super(`Nome de redação inválido: "${name}"`);
    this.name = "InvalidNewsroomNameError";
  }
}

const NEWSROOM_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+eth$/;

/** Nome ENS em minúsculas terminado em .eth (nomes e subnomes). */
export function isNewsroomName(name: string): boolean {
  return NEWSROOM_RE.test(name);
}

/** Ação da prova do World ID: `submit:<redação>:<época>`. */
export function actionFor(newsroom: string, epoch: number): string {
  if (!isNewsroomName(newsroom)) throw new InvalidNewsroomNameError(newsroom);
  if (!isEpoch(epoch)) throw new RangeError(`Época inválida: ${epoch}`);
  return `submit:${newsroom}:${epoch}`;
}
