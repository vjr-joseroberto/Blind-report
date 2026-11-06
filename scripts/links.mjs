// Shows the public ADDRESSES of the test wallets and the links to view them in the explorers. Never reads or prints private keys.
const ETHERSCAN = "https://sepolia.etherscan.io";
const ARKIV = "https://rabdi.explorer.arkiv.network";
const wallets = [["Newsroom administrator (OWNER)", "OWNER_ADDRESS"], ["Relayer (pays for Arkiv)", "RELAYER_ADDRESS"], ["Journalist", "JOURNALIST_ADDRESS"]];

for (const [label, name] of wallets) {
  const a = process.env[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(a ?? "")) {
    console.log(`${label}: ${name} missing or invalid in .env`);
    continue;
  }
  console.log(`${label}\n  ${a}\n  ENS/Sepolia: ${ETHERSCAN}/address/${a}\n  Arkiv (Rabdi): ${ARKIV}/address/${a}\n`);
}
