# Paytree

Lock tokenized stock in a vault. Spend up to 5% of the locked notional as USDG from a pool. Repay USDG to clear debt, then withdraw the stock.

USDG is not minted from your shares. The vault owner funds a USDG pool with `seedUsdg`. When you spend, the vault sends USDG to a recipient and records your debt. Locked stock stays in the vault until debt is zero.

Testnet uses `MockStock` (MSTK) and `MockUSDG` at 1:1 notional with mainnet Robinhood stock tokens and Paxos USDG as the intended production pair.

## Deployed (Robinhood testnet)

Chain ID **46630**. Source of truth: `scripts/deployments.json`.

| Contract | Address |
|----------|---------|
| MockStock (MSTK) | `0xD960ad8F2593a9BEa8EaD2bee1Cc8F6E90362f3b` |
| MockUSDG (USDG) | `0x426d0Df597e0b2938dc846dAfD9De8A77A6Bf93e` |
| PaytreeVault | `0x93132433013E92F18F7850B80C4cB31Cd578B048` |

Explorer: [explorer.testnet.chain.robinhood.com](https://explorer.testnet.chain.robinhood.com)

Arbitrum Sepolia (`421614`) is supported in Hardhat for deploy scripts only. The frontend targets Robinhood testnet.

## Tests

```bash
npm install --legacy-peer-deps
npm run compile
npm test
```

## Deploy and CLI flow

```bash
cp .env.example .env
# PRIVATE_KEY with testnet ETH for gas
npm run deploy:robinhood
REUSE_DEPLOYMENT=1 npm run demo:robinhood
```

Local Hardhat (ephemeral chain):

```bash
npm run demo
```

`demo.js` runs deposit, spend, repay, and withdraw against the addresses in `deployments.json`.

## Frontend

```bash
cd frontend && npm install && npm run dev
```

Connect a wallet on chain 46630. Balances and allowance come from `PaytreeVault` and token contracts. Use **+ Drip 100k** if you need MSTK. Repay requires USDG in your wallet (for example from a spend to yourself).

## Contracts

`PaytreeVault`: `deposit`, `previewAllowance`, `spend`, `repay`, `withdraw`, `seedUsdg` (owner). `ALLOWANCE_BPS = 500` (5%).

## License

MIT
