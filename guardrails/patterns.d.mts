export const CODE_PATTERNS: { name: string; re: RegExp }[];
export const BASH_PATTERNS: { name: string; re: RegExp }[];
export function isExemptPath(p?: string): boolean;
export function scanText(text: string): string[];
export function scanBash(command: string): string[];
