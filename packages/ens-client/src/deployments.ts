import ethRegistrar from "./abis/ETHRegistrar.json";
import ethRegistry from "./abis/ETHRegistry.json";
import mockUSDC from "./abis/MockUSDC.json";
import permissionedResolver from "./abis/PermissionedResolver.json";
import userRegistry from "./abis/UserRegistry.json";
import verifiableFactory from "./abis/VerifiableFactory.json";

/**
 * ENSv2 deployment on Sepolia (redeploy of 2026-10-01, commit 07e55a0 of contracts-v2).
 * Source: https://docs.ens.domains/learn/deployments — ENSv2 has already been redeployed several times: double-check before using.
 * The only place in the project with these addresses.
 */
export const ENSV2_SEPOLIA = {
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  mockUSDC: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const;

export const ABIS = { ethRegistrar, ethRegistry, mockUSDC, permissionedResolver, userRegistry, verifiableFactory } as const;

/** Roles (nybbles of EnhancedAccessControl; each role's "admin" is 128 bits above). */
export const ROLES = {
  resolver: { setAddress: 1n << 0n, setText: 1n << 4n },
  registry: { registrar: 1n << 0n, unregister: 1n << 12n, renew: 1n << 16n, setResolver: 1n << 24n },
} as const;
export const adminOf = (role: bigint): bigint => role << 128n;
