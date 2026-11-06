import { encodeFunctionData, type Hex } from "viem";
import { ABIS } from "./deployments.ts";
import { dnsEncode } from "./dns.ts";

export function setTextCalldata(name: string, key: string, value: string): Hex {
  return encodeFunctionData({ abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(name), key, value] });
}

/** Call used only to identify the text key in `grantSetterRoles` (the value is empty). */
export function setterFor(name: string, key: string): Hex {
  return setTextCalldata(name, key, "");
}
