import { defineBackendContract } from "../backend-contract.ts";
import { newBackend, sleep } from "./helpers.ts";

defineBackendContract("SDK do Arkiv (nó local)", async () => ({
  relayer: await newBackend(),
  newsroom: await newBackend(),
  stranger: await newBackend(),
  advance: sleep,
}));
