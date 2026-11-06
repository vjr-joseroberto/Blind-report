/** Authenticated data: swapping the newsroom, key version or category invalidates opening. */
export function aadOf(newsroom: string, pubkeyVersion: number, category: string): Uint8Array {
  return new TextEncoder().encode(`${newsroom}|${pubkeyVersion}|${category}`);
}
