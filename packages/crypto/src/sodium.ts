import sodiumLib from "libsodium-wrappers";

// The libsodium WebAssembly must be ready before first use.
await sodiumLib.ready;
export const sodium = sodiumLib;
