export type RecordedRequest = {
  url: string;
  host: string;
  method: string;
  bodyBytes: Uint8Array;
  bodyText: string;
};

export type Recorder = {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  /** Hosts contatados, sem repetição, na ordem em que apareceram. */
  hosts(): string[];
  /** Algum corpo gravado contém este texto? (para provar que um segredo NÃO saiu) */
  anyBodyContains(text: string): boolean;
  /** Algum corpo gravado contém esta sequência de bytes? */
  anyBodyContainsBytes(bytes: Uint8Array): boolean;
};

async function bodyToBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body === null || body === undefined) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Um `fetch` que grava o que foi enviado e repassa para o `fetch` base. Usado nos testes por script. */
export function createRecorder(base: typeof fetch = globalThis.fetch): Recorder {
  const requests: RecordedRequest[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const isRequest = typeof input === "object" && !(input instanceof URL);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (isRequest ? input.method : "GET")).toUpperCase();
    const bodyBytes = await bodyToBytes(init?.body ?? undefined);
    requests.push({ url, host: new URL(url).hostname.toLowerCase(), method, bodyBytes, bodyText: new TextDecoder().decode(bodyBytes) });
    return base(input, init);
  };
  return {
    fetch: recordingFetch,
    requests,
    hosts: () => [...new Set(requests.map((r) => r.host))],
    anyBodyContains: (text) => requests.some((r) => r.bodyText.includes(text)),
    anyBodyContainsBytes: (bytes) => requests.some((r) => indexOfBytes(r.bodyBytes, bytes) >= 0),
  };
}
