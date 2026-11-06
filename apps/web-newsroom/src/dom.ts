// Minimal helper to build the screen. All text goes through `textContent` (never HTML).
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v as EventListener);
    else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Downloads a file. The link must be in the document (Firefox) and the URL can only be released after the download has started. */
export const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Saves what was typed in fields with an `id`, to restore after redrawing the screen (in memory only). */
export function captureFields(root: ParentNode): () => void {
  const saved = new Map<string, { value: string; checked: boolean }>();
  root.querySelectorAll<HTMLInputElement>("input[id], textarea[id], select[id]").forEach((el) => saved.set(el.id, { value: el.value, checked: (el as HTMLInputElement).checked }));
  return () => {
    for (const [id, v] of saved) {
      const el = root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
      if (!el || el.readOnly) continue;
      if (el.type === "checkbox") el.checked = v.checked;
      else if (v.value !== "" && el.value === "") el.value = v.value;
    }
  };
}

export const readFileText = (f: File) => f.text();
export const readFileBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
