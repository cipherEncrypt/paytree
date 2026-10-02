const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "frontend/src/generated");

const artifacts = [
  ["PaytreeVault.sol/PaytreeVault.json", "PaytreeVault.json"],
  ["MockStock.sol/MockStock.json", "MockStock.json"],
  ["MockUSDG.sol/MockUSDG.json", "MockUSDG.json"],
];

fs.mkdirSync(path.join(out, "abis"), { recursive: true });

for (const [src, name] of artifacts) {
  const artifactPath = path.join(root, "artifacts/contracts", src);
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(path.join(out, "abis", name), JSON.stringify({ abi }, null, 2));
}

fs.copyFileSync(
  path.join(root, "scripts/deployments.json"),
  path.join(out, "deployments.json")
);

console.log("Synced ABIs and deployments to frontend/src/generated/");
