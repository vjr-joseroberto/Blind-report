// Mostra os ENDEREÇOS públicos das carteiras de teste e os links para vê-los nos exploradores. Nunca lê nem imprime chaves privadas.
const ETHERSCAN = "https://sepolia.etherscan.io";
const ARKIV = "https://rabdi.explorer.arkiv.network";
const wallets = [["Administrador da redação (OWNER)", "OWNER_ADDRESS"], ["Relayer (paga o Arkiv)", "RELAYER_ADDRESS"], ["Jornalista", "JOURNALIST_ADDRESS"]];

for (const [label, name] of wallets) {
  const a = process.env[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(a ?? "")) {
    console.log(`${label}: ${name} ausente ou inválido no .env`);
    continue;
  }
  console.log(`${label}\n  ${a}\n  ENS/Sepolia: ${ETHERSCAN}/address/${a}\n  Arkiv (Rabdi): ${ARKIV}/address/${a}\n`);
}
