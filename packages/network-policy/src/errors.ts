/** The request host is not in the declared list. */
export class HostNotAllowedError extends Error {
  constructor(public readonly host: string, public readonly url: string) {
    super(`Host not allowed by the network policy: ${host}`);
    this.name = "HostNotAllowedError";
  }
}

/** The network configuration is invalid or tries something the project does not allow. */
export class InvalidNetworkConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNetworkConfigError";
  }
}
