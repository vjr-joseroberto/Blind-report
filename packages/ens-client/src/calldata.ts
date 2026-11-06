import { encodeFunctionData, type Hex } from "viem";
import { ABIS } from "./deployments.ts";
import { dnsEncode } from "./dns.ts";

export function setTextCalldata(name: string, key: string, value: string): Hex {
  return encodeFunctionData({ abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(name), key, value] });
}

/** Chamada usada só para identificar a chave de texto em `grantSetterRoles` (o valor é vazio). */
export function setterFor(name: string, key: string): Hex {
  return setTextCalldata(name, key, "");
}
