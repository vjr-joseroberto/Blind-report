import { defineBackendContract } from "../backend-contract.ts";
import { newBackend, sleep } from "./helpers.ts";

defineBackendContract("Arkiv SDK (local node)", async () => ({
  relayer: await newBackend(),
  newsroom: await newBackend(),
  stranger: await newBackend(),
  advance: sleep,
}));
