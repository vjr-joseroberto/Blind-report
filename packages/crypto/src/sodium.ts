import sodiumLib from "libsodium-wrappers";

// O WebAssembly do libsodium precisa estar pronto antes do primeiro uso.
await sodiumLib.ready;
export const sodium = sodiumLib;
