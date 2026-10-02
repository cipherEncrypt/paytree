import { useEffect, useId, useState } from "react";
import { formatWalletError } from "./ensureChain.js";
import { ADDRESSES } from "./contracts.js";
import {
  shortAddress,
  usePaytreeActions,
  useVaultState,
  useWallet,
} from "./hooks/usePaytree.js";
import "./App.css";

const EXPLORER_BASE = "https://explorer.testnet.chain.robinhood.com";
const STEP_ORDER = ["deposit", "spend", "repay", "withdraw"];

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return "Just now";
  }
}

function txLine(hash) {
  if (!hash) return "";
  return `Tx ${hash.slice(0, 10)}…${hash.slice(-4)}`;
}

function getTxUrl(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

function getAddressUrl(addr) {
  return `${EXPLORER_BASE}/address/${addr}`;
}

const HOW_IT_WORKS = [
  { title: "Lock stock", detail: "your shares stay yours" },
  { title: "Spend USDG", detail: "up to 5% of what you locked" },
  { title: "Repay", detail: "debt clears, stock unlocks" },
];

export default function App() {
  const {
    address,
    isConnected,
    isConnecting,
    connectError,
    wrongNetwork,
    connectWallet,
    disconnect,
    switchNetwork,
  } = useWallet();

  const {
    locked,
    debt,
    spendable,
    allowanceCap,
    mstkBalance,
    usdgBalance,
    vaultUsdg,
    allowanceBps,
    refetch,
    isFetching,
  } = useVaultState(address);

  const { deposit, spend, repay, withdraw, dripStock, busy } = usePaytreeActions({
    spendable,
    debt,
    refetch,
  });

  const [activeStep, setActiveStep] = useState("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [spendTo, setSpendTo] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [spendError, setSpendError] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [statTick, setStatTick] = useState(0);
  const [shakeError, setShakeError] = useState(false);
  const [actionError, setActionError] = useState("");

  const [activityLog, setActivityLog] = useState(() => {
    try {
      const saved = sessionStorage.getItem("paytree_activity");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addActivity = (entry) => {
    setActivityLog((prev) => {
      const updated = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          ...entry,
        },
        ...prev,
      ].slice(0, 10);
      try {
        sessionStorage.setItem("paytree_activity", JSON.stringify(updated));
      } catch {
        // ignore storage error
      }
      return updated;
    });
  };

  const depositId = useId();
  const spendToId = useId();
  const spendAmtId = useId();
  const repayId = useId();

  useEffect(() => {
    if (address && !spendTo) setSpendTo(address);
  }, [address, spendTo]);

  const bumpStats = () => setStatTick((t) => t + 1);

  const onConnect = () => connectWallet();

  const parsedDeposit = Number(depositAmount.replace(/,/g, "")) || 0;
  const depositAllowanceGain = Math.floor((parsedDeposit * allowanceBps) / 10_000);

  const parsedSpend = Number(spendAmount.replace(/,/g, "")) || 0;
  const remainingSpendAfter = Math.max(0, spendable - parsedSpend);

  const parsedRepay = Number(repayAmount.replace(/,/g, "")) || 0;
  const remainingDebtAfter = Math.max(0, debt - parsedRepay);

  const activeIndex = STEP_ORDER.indexOf(activeStep);

  const handleTabKeyDown = (e) => {
    const currentIndex = STEP_ORDER.indexOf(activeStep);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextTab = STEP_ORDER[(currentIndex + 1) % STEP_ORDER.length];
      setActiveStep(nextTab);
      document.getElementById(`tab-${nextTab}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevTab =
        STEP_ORDER[(currentIndex - 1 + STEP_ORDER.length) % STEP_ORDER.length];
      setActiveStep(prevTab);
      document.getElementById(`tab-${prevTab}`)?.focus();
    }
  };

  const utilizationPercent =
    allowanceCap > 0 ? Math.min(100, Math.round((debt / allowanceCap) * 100)) : 0;

  const allowanceRateLabel =
    allowanceBps % 100 === 0
      ? `${allowanceBps / 100}%`
      : `${(allowanceBps / 100).toFixed(2)}%`;

  const onDeposit = async (e) => {
    e.preventDefault();
    setActionError("");
    setStatusLine("Confirm deposit in your wallet…");
    try {
      const hash = await deposit(depositAmount);
      addActivity({
        type: "deposit",
        title: `Deposited ${parsedDeposit.toLocaleString("en-US")} MSTK`,
        detail: `+${formatUsd(depositAllowanceGain)} allowance`,
        hash,
      });
      setSpendError("");
      setStatusLine(hash ? `Confirmed: ${txLine(hash)}` : "Deposit confirmed.");
      bumpStats();
    } catch (err) {
      setStatusLine("");
      setActionError(formatWalletError(err));
    }
  };

  const onSpend = async (e) => {
    e.preventDefault();
    setSpendError("");
    setActionError("");
    const amt = Number(spendAmount.replace(/,/g, ""));
    if (amt > spendable) {
      setSpendError("Exceeds your spending allowance.");
      setShakeError(true);
      window.setTimeout(() => setShakeError(false), 400);
      return;
    }
    setStatusLine("Confirm spend in your wallet…");
    try {
      const hash = await spend(spendTo, spendAmount);
      addActivity({
        type: "spend",
        title: `Spent ${formatUsd(amt)} USDG`,
        detail: `Transferred to ${shortAddress(spendTo)}`,
        hash,
      });
      setStatusLine(hash ? `Confirmed: ${txLine(hash)}` : "Spend confirmed.");
      bumpStats();
    } catch (err) {
      setStatusLine("");
      if (err?.code === "PAYCHECK") {
        setSpendError("Exceeds your spending allowance.");
        setShakeError(true);
        window.setTimeout(() => setShakeError(false), 400);
        return;
      }
      setActionError(formatWalletError(err));
    }
  };

  const onRepay = async (e) => {
    e.preventDefault();
    setActionError("");
    setStatusLine("Confirm repay in your wallet…");
    try {
      const hash = await repay(repayAmount);
      addActivity({
        type: "repay",
        title: `Repaid ${formatUsd(parsedRepay)} USDG`,
        detail: "Debt cleared. Stock can be withdrawn.",
        hash,
      });
      setStatusLine(hash ? `Confirmed: ${txLine(hash)}` : "Repay confirmed.");
      bumpStats();
    } catch (err) {
      setStatusLine("");
      setActionError(formatWalletError(err));
    }
  };

  const onWithdraw = async () => {
    if (debt > 0 || locked === 0) return;
    setActionError("");
    setStatusLine("Confirm withdraw in your wallet…");
    try {
      const hash = await withdraw();
      addActivity({
        type: "withdraw",
        title: `Withdrew ${formatUsd(locked)} MSTK`,
        detail: "Stock returned to your wallet",
        hash,
      });
      setStatusLine(hash ? `Confirmed: ${txLine(hash)}` : "Withdraw confirmed.");
      bumpStats();
    } catch (err) {
      setStatusLine("");
      setActionError(formatWalletError(err));
    }
  };

  const onClaimFaucet = async () => {
    setActionError("");
    setStatusLine("Confirm Get test MSTK in your wallet…");
    try {
      const hash = await dripStock();
      addActivity({
        type: "faucet",
        title: "Claimed 100,000 Test MSTK",
        detail: "Robinhood Testnet faucet mint",
        hash,
      });
      setStatusLine("Received 100,000 MSTK.");
      bumpStats();
    } catch (err) {
      setStatusLine("");
      setActionError(formatWalletError(err));
    }
  };

  const showPaycheckHint =
    isConnected && locked === 0 && spendable === 0 && debt === 0;

  return (
    <div className="page">
      <a className="skip" href="#main">
        Skip to main content
      </a>

      <header className="header shell">
        <div className="brand">
          <span className="wordmark" translate="no">
            Paytree
          </span>
          <span className="network-pill">Robinhood testnet</span>
        </div>
        {isConnected ? (
          <div className="header-auth">
            <span className="wallet-addr" translate="no">
              {shortAddress(address)}
            </span>
            <button
              type="button"
              className="link-disconnect"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-connect"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </header>

      <main
        id="main"
        className={`main shell ${isConnected ? "main-dashboard" : "main-landing"}`}
      >
        {!isConnected ? (
          <div className="screen screen-landing">
            <section className="hero hero-narrow" aria-labelledby="hero-title">
              <h1 id="hero-title" className="hero-title">
                Deposit tokenized stocks. Spend USDG. Never sell.
              </h1>
              <p className="hero-lede">
                Lock stock as a guarantee. Spend dollars from a cash pool. Get the
                stock back when you repay.
              </p>
            </section>

            <section className="how-block" aria-labelledby="how-title">
              <h2 id="how-title" className="how-title">
                How it works
              </h2>
              <ol className="how-steps">
                {HOW_IT_WORKS.map((step) => (
                  <li key={step.title} className="how-step">
                    <p className="how-step-title">{step.title}</p>
                    <p className="how-step-detail">{step.detail}</p>
                  </li>
                ))}
              </ol>
              <p className="example-line">
                You can spend up to 5% of locked stock as USDG from the cash pool.
                That USDG is a loan. Your stock is not sold.
              </p>
            </section>

            <div className="landing-cta">
              <button
                type="button"
                className="btn btn-primary btn-landing"
                onClick={onConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </button>
              {connectError && (
                <p className="field-error" role="alert">
                  {connectError.message}
                </p>
              )}
              <p className="landing-footnote">
                Robinhood testnet uses MSTK and mock USDG. Production would use
                Robinhood stock tokens and Paxos USDG.
              </p>
            </div>
          </div>
        ) : (
          <div className="screen screen-dashboard dash">
            {wrongNetwork && (
              <div className="network-banner" role="status">
                <p>Switch to Robinhood testnet (chain 46630) to use Paytree.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={switchNetwork}
                >
                  Switch network
                </button>
              </div>
            )}

            {/* Hero Metric Card */}
            <section className="dash-hero" aria-label="Spending allowance">
              {showPaycheckHint ? (
                <>
                  <p className="dash-hero-kicker">You can spend</p>
                  <p className="dash-hero-empty">Deposit stock to see your allowance.</p>
                  <p className="dash-hero-caption">
                    USDG is drawn from the cash pool. Your stock stays locked as
                    collateral.
                  </p>
                </>
              ) : (
                <>
                  <div className="dash-hero-header">
                    <div>
                      <p className="dash-hero-kicker">You can spend</p>
                      <p
                        key={`hero-spend-${statTick}-${spendable}`}
                        className="dash-hero-amount tabular stat-animate"
                      >
                        {formatUsd(spendable)}
                      </p>
                    </div>
                    {allowanceCap > 0 && (
                      <div className="dash-hero-badge">
                        <span className="badge-kicker">Allowance cap</span>
                        <span className="badge-value tabular">
                          {formatUsd(allowanceCap)}
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="dash-hero-caption">
                    USDG from the cash pool. Your stock stays locked as collateral.
                  </p>

                  {allowanceCap > 0 && (
                    <div className="dash-hero-meter" aria-label="Allowance utilization">
                      <div className="meter-head">
                        <span className="meter-label">Allowance used</span>
                        <span className="meter-stat tabular">
                          {formatUsd(debt)} of {formatUsd(allowanceCap)} ({utilizationPercent}%)
                        </span>
                      </div>
                      <div
                        className="meter-bar"
                        role="progressbar"
                        aria-valuenow={utilizationPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Allowance used percentage"
                      >
                        <div
                          className="meter-fill"
                          style={{ width: `${utilizationPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Collateral & Debt Metrics */}
            <div className="dash-metrics" aria-label="Collateral and debt">
              <div className="dash-metric">
                <span className="dash-metric-label">Stock locked</span>
                <span
                  key={`locked-${statTick}-${locked}`}
                  className="dash-metric-value tabular stat-animate"
                >
                  {formatUsd(locked)}
                </span>
              </div>
              <div className="dash-metric dash-metric-debt">
                <span className="dash-metric-label">You owe</span>
                <span
                  key={`debt-${statTick}-${debt}`}
                  className={`dash-metric-value tabular stat-animate ${
                    debt > 0 ? "is-debt" : "is-zero"
                  }`}
                >
                  {formatUsd(debt)}
                </span>
              </div>
            </div>

            {/* Wallet Balances + Quick Drip Chip */}
            <div className="dash-wallet" aria-live="polite">
              <div className="dash-wallet-cell">
                <div className="dash-wallet-cell-top">
                  <span className="dash-wallet-label">Wallet MSTK</span>
                  <button
                    type="button"
                    className="btn-faucet-chip"
                    onClick={onClaimFaucet}
                    disabled={busy || wrongNetwork}
                    title="Mint 100,000 test MSTK from Robinhood testnet faucet"
                    aria-label="Mint 100,000 test MSTK from faucet"
                  >
                    + Drip 100k
                  </button>
                </div>
                <span className="dash-wallet-value tabular">
                  {isFetching ? "…" : mstkBalance.toLocaleString("en-US")}
                </span>
              </div>
              <div className="dash-wallet-cell">
                <div className="dash-wallet-cell-top">
                  <span className="dash-wallet-label">Wallet USDG</span>
                  <span className="dash-wallet-sub">For repay</span>
                </div>
                <span className="dash-wallet-value tabular">
                  {isFetching ? "…" : formatUsd(usdgBalance)}
                </span>
              </div>
              <div className="dash-wallet-cell">
                <div className="dash-wallet-cell-top">
                  <span className="dash-wallet-label">Vault USDG pool</span>
                  <span className="dash-wallet-sub">Cash for spend</span>
                </div>
                <span className="dash-wallet-value tabular">
                  {isFetching ? "…" : formatUsd(vaultUsdg)}
                </span>
              </div>
            </div>

            <section className="console-panel" aria-labelledby="console-title">
              <div className="console-head">
                <div className="console-title-group">
                  <h2 id="console-title" className="console-title">
                    Paycheck
                  </h2>
                  <p className="console-desc">
                    Deposit, spend, repay, or withdraw through the vault.
                  </p>
                </div>
                <div className="console-status-pill">
                  <div className="console-pulse-wrap" aria-hidden="true">
                    <span className="console-pulse-dot" />
                    <span className="console-pulse-ring" />
                  </div>
                  <span>Pool funded</span>
                </div>
              </div>

              {/* Segmented Control Tabs */}
              <div
                className="console-tabs"
                role="tablist"
                aria-label="Vault actions"
                onKeyDown={handleTabKeyDown}
                style={{ "--active-index": activeIndex >= 0 ? activeIndex : 0 }}
              >
                <div className="console-tab-indicator" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  id="tab-deposit"
                  aria-selected={activeStep === "deposit"}
                  aria-controls="panel-deposit"
                  tabIndex={activeStep === "deposit" ? 0 : -1}
                  className={`console-tab ${activeStep === "deposit" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveStep("deposit");
                    setActionError("");
                    setSpendError("");
                  }}
                >
                  <span className="tab-label">
                    <span className="tab-label-full">Deposit</span>
                    <span className="tab-label-short">Deposit</span>
                  </span>
                  <span className="tab-badge is-neutral tabular">
                    {locked > 0 ? formatUsd(locked) : allowanceRateLabel}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="tab-spend"
                  aria-selected={activeStep === "spend"}
                  aria-controls="panel-spend"
                  tabIndex={activeStep === "spend" ? 0 : -1}
                  className={`console-tab ${activeStep === "spend" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveStep("spend");
                    setActionError("");
                    setSpendError("");
                  }}
                >
                  <span className="tab-label">
                    <span className="tab-label-full">Spend</span>
                    <span className="tab-label-short">Spend</span>
                  </span>
                  <span
                    className={`tab-badge tabular ${
                      spendable > 0 ? "is-green" : "is-zero"
                    }`}
                  >
                    {spendable > 0 ? formatUsd(spendable) : "$0 avail"}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="tab-repay"
                  aria-selected={activeStep === "repay"}
                  aria-controls="panel-repay"
                  tabIndex={activeStep === "repay" ? 0 : -1}
                  className={`console-tab ${activeStep === "repay" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveStep("repay");
                    setActionError("");
                    setSpendError("");
                  }}
                >
                  <span className="tab-label">Repay</span>
                  <span
                    className={`tab-badge tabular ${
                      debt > 0 ? "is-amber" : "is-zero"
                    }`}
                  >
                    {debt > 0 ? formatUsd(debt) : "$0 debt"}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="tab-withdraw"
                  aria-selected={activeStep === "withdraw"}
                  aria-controls="panel-withdraw"
                  tabIndex={activeStep === "withdraw" ? 0 : -1}
                  className={`console-tab ${activeStep === "withdraw" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveStep("withdraw");
                    setActionError("");
                    setSpendError("");
                  }}
                >
                  <span className="tab-label">Withdraw</span>
                  <span
                    className={`tab-badge tabular ${
                      debt === 0 && locked > 0
                        ? "is-ready"
                        : debt > 0
                        ? "is-lock"
                        : "is-zero"
                    }`}
                  >
                    {debt === 0 && locked > 0
                      ? "Ready"
                      : debt > 0
                      ? "Locked"
                      : "Collateral"}
                  </span>
                </button>
              </div>

              {/* Console Body: One Focused Tab at a Time */}
              <div className="console-body">
                {/* 1. DEPOSIT PANEL */}
                {activeStep === "deposit" && (
                  <div
                    id="panel-deposit"
                    role="tabpanel"
                    aria-labelledby="tab-deposit"
                    className="console-card"
                  >
                    <div className="console-card-intro">
                      <h3 className="console-card-title">Deposit</h3>
                      <p className="console-card-sub">
                        Lock MSTK in the vault. The contract sets spendable USDG to{" "}
                        {allowanceRateLabel} of what you lock. Your stock is not sold.
                      </p>
                    </div>

                    <form className="console-form" onSubmit={onDeposit}>
                      <div className="field-group">
                        <div className="field-label-row">
                          <label htmlFor={depositId}>Amount to lock</label>
                          <span className="field-helper-meta tabular">
                            Wallet: {mstkBalance.toLocaleString("en-US")} MSTK
                          </span>
                        </div>

                        <div className="input-token-wrap">
                          <input
                            id={depositId}
                            name="depositAmount"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck={false}
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="Amount…"
                            disabled={busy || wrongNetwork}
                          />
                          <span className="token-pill">MSTK</span>
                        </div>

                        <div className="chip-row">
                          <button
                            type="button"
                            className="chip-btn chip-btn-max"
                            disabled={busy || wrongNetwork || mstkBalance === 0}
                            onClick={() => setDepositAmount(String(mstkBalance))}
                          >
                            Max wallet
                          </button>
                        </div>
                      </div>

                      {/* Calculation Preview */}
                      <div className="math-preview" aria-live="polite">
                        <div className="preview-item">
                          <span className="preview-label">Allowance added</span>
                          <span className="preview-val is-green tabular">
                            +{formatUsd(depositAllowanceGain)} USDG
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">You can spend after</span>
                          <span className="preview-val tabular">
                            {formatUsd(spendable + depositAllowanceGain)} USDG
                          </span>
                        </div>
                        <div className="preview-item">
                          <span className="preview-label">Lock ratio</span>
                          <span className="preview-sub">1:1 MSTK in vault. No liquidation in this build.</span>
                        </div>
                      </div>

                      <div className="console-cta-row">
                        <button
                          type="submit"
                          className="btn btn-primary btn-block"
                          disabled={
                            busy ||
                            wrongNetwork ||
                            parsedDeposit <= 0 ||
                            mstkBalance < parsedDeposit
                          }
                        >
                          {busy
                            ? "Waiting for wallet…"
                            : `Deposit ${
                                parsedDeposit > 0
                                  ? parsedDeposit.toLocaleString("en-US") + " "
                                  : ""
                              }MSTK`}
                        </button>
                      </div>

                      {mstkBalance === 0 && (
                        <div className="faucet-callout">
                          <p>You need MSTK in your wallet to deposit.</p>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onClaimFaucet}
                            disabled={busy || wrongNetwork}
                          >
                            Get test MSTK
                          </button>
                        </div>
                      )}
                    </form>
                  </div>
                )}

                {/* 2. SPEND PANEL */}
                {activeStep === "spend" && (
                  <div
                    id="panel-spend"
                    role="tabpanel"
                    aria-labelledby="tab-spend"
                    className="console-card"
                  >
                    <div className="console-card-intro">
                      <h3 className="console-card-title">Spend</h3>
                      <p className="console-card-sub">
                        Send USDG from the vault pool to any address. Locked stock stays
                        in the vault.
                      </p>
                    </div>

                    <form className="console-form" onSubmit={onSpend}>
                      <div className="field-group">
                        <div className="field-label-row">
                          <label htmlFor={spendToId}>Recipient address</label>
                          {address && (
                            <button
                              type="button"
                              className="btn-inline-link"
                              onClick={() => setSpendTo(address)}
                            >
                              Send to myself
                            </button>
                          )}
                        </div>
                        <input
                          id={spendToId}
                          name="spendRecipient"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={spendTo}
                          onChange={(e) => setSpendTo(e.target.value)}
                          placeholder="0x…"
                          disabled={busy || wrongNetwork}
                        />
                      </div>

                      <div className="field-group">
                        <div className="field-label-row">
                          <label htmlFor={spendAmtId}>Amount to spend</label>
                          <span className="field-helper-meta tabular">
                            Available: {formatUsd(spendable)}
                          </span>
                        </div>

                        <div className="input-token-wrap">
                          <input
                            id={spendAmtId}
                            name="spendAmount"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck={false}
                            value={spendAmount}
                            onChange={(e) => {
                              setSpendAmount(e.target.value);
                              setSpendError("");
                            }}
                            placeholder="Amount…"
                            disabled={busy || wrongNetwork}
                          />
                          <span className="token-pill">USDG</span>
                        </div>

                        <div className="chip-row">
                          <button
                            type="button"
                            className="chip-btn chip-btn-max"
                            disabled={busy || wrongNetwork || spendable === 0}
                            onClick={() => setSpendAmount(String(spendable))}
                          >
                            Max allowance ({formatUsd(spendable)})
                          </button>
                        </div>
                      </div>

                      {spendError ? (
                        <p
                          className={`field-error ${
                            shakeError ? "field-error-shake" : ""
                          }`}
                          role="alert"
                        >
                          {spendError}
                        </p>
                      ) : (
                        <div className="math-preview" aria-live="polite">
                          <div className="preview-item">
                            <span className="preview-label">Transfer from cash pool</span>
                            <span className="preview-val is-green tabular">
                              {formatUsd(parsedSpend)} USDG
                            </span>
                          </div>
                          <div className="preview-item">
                            <span className="preview-label">You can spend after</span>
                            <span className="preview-val tabular">
                              {formatUsd(remainingSpendAfter)} USDG
                            </span>
                          </div>
                          <div className="preview-item">
                            <span className="preview-label">Stock locked</span>
                            <span className="preview-sub">Not sold when you spend.</span>
                          </div>
                        </div>
                      )}

                      <div className="console-cta-row">
                        <button
                          type="submit"
                          className="btn btn-primary btn-block btn-green-action"
                          disabled={
                            busy ||
                            wrongNetwork ||
                            locked === 0 ||
                            spendable === 0 ||
                            vaultUsdg === 0 ||
                            parsedSpend <= 0 ||
                            parsedSpend > spendable ||
                            parsedSpend > vaultUsdg
                          }
                        >
                          {busy
                            ? "Waiting for wallet…"
                            : `Spend ${
                                parsedSpend > 0 ? formatUsd(parsedSpend) + " " : ""
                              }USDG`}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* 3. REPAY PANEL */}
                {activeStep === "repay" && (
                  <div
                    id="panel-repay"
                    role="tabpanel"
                    aria-labelledby="tab-repay"
                    className="console-card"
                  >
                    <div className="console-card-intro">
                      <h3 className="console-card-title">Repay</h3>
                      <p className="console-card-sub">
                        Return USDG to the vault pool. Debt must be zero before you
                        withdraw stock.
                      </p>
                    </div>

                    {debt === 0 ? (
                      <div className="status-callout is-success">
                        <div className="status-callout-head">
                          <span className="status-dot is-green" aria-hidden="true" />
                          <h4 className="status-callout-title">No debt</h4>
                        </div>
                        <p className="status-callout-desc">
                          You can withdraw locked stock when debt is zero.
                        </p>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setActiveStep("withdraw")}
                        >
                          Open Withdraw
                        </button>
                      </div>
                    ) : (
                      <form className="console-form" onSubmit={onRepay}>
                        <div className="field-group">
                          <div className="field-label-row">
                            <label htmlFor={repayId}>Amount to repay</label>
                            <span className="field-helper-meta tabular">
                              You owe: {formatUsd(debt)}
                            </span>
                          </div>

                          <div className="input-token-wrap">
                            <input
                              id={repayId}
                              name="repayAmount"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              spellCheck={false}
                              value={repayAmount}
                              onChange={(e) => setRepayAmount(e.target.value)}
                              placeholder="Amount…"
                              disabled={busy || wrongNetwork}
                            />
                            <span className="token-pill">USDG</span>
                          </div>

                          <div className="chip-row">
                            <button
                              type="button"
                              className="chip-btn"
                              disabled={busy || wrongNetwork || debt === 0}
                              onClick={() => setRepayAmount(String(Math.ceil(debt / 2)))}
                            >
                              50% ({formatUsd(Math.ceil(debt / 2))})
                            </button>
                            <button
                              type="button"
                              className="chip-btn chip-btn-max"
                              disabled={busy || wrongNetwork}
                              onClick={() => setRepayAmount(String(debt))}
                            >
                              Pay in Full ({formatUsd(debt)})
                            </button>
                          </div>
                        </div>

                        <div className="math-preview" aria-live="polite">
                          <div className="preview-item">
                            <span className="preview-label">Remaining debt after payment</span>
                            <span
                              className={`preview-val tabular ${
                                remainingDebtAfter === 0 ? "is-green" : "is-amber"
                              }`}
                            >
                              {formatUsd(remainingDebtAfter)} USDG
                            </span>
                          </div>
                          <div className="preview-item">
                            <span className="preview-label">Withdraw</span>
                            <span className="preview-sub">
                              {remainingDebtAfter === 0
                                ? "Stock unlocks after full repay."
                                : "Repay the rest before withdraw."}
                            </span>
                          </div>
                        </div>

                        <div className="console-cta-row">
                          <button
                            type="submit"
                            className="btn btn-primary btn-block"
                            disabled={
                              busy ||
                              wrongNetwork ||
                              debt === 0 ||
                              parsedRepay <= 0 ||
                              parsedRepay > debt ||
                              parsedRepay > usdgBalance
                            }
                          >
                            {busy
                              ? "Waiting for wallet…"
                              : `Repay ${
                                  parsedRepay > 0 ? formatUsd(parsedRepay) + " " : ""
                                }USDG`}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* 4. WITHDRAW PANEL */}
                {activeStep === "withdraw" && (
                  <div
                    id="panel-withdraw"
                    role="tabpanel"
                    aria-labelledby="tab-withdraw"
                    className="console-card"
                  >
                    <div className="console-card-intro">
                      <h3 className="console-card-title">Withdraw</h3>
                      <p className="console-card-sub">
                        Pull locked MSTK back to your wallet. Requires zero debt.
                      </p>
                    </div>

                    {debt > 0 ? (
                      <div className="status-callout is-warn">
                        <div className="status-callout-head">
                          <span className="status-dot is-amber" aria-hidden="true" />
                          <h4 className="status-callout-title">Repay first</h4>
                        </div>
                        <p className="status-callout-desc">
                          You owe <strong>{formatUsd(debt)} USDG</strong>. Repay before
                          withdrawing stock.
                        </p>
                        <div className="console-cta-row">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              setRepayAmount(String(debt));
                              setActiveStep("repay");
                            }}
                          >
                            Repay {formatUsd(debt)}
                          </button>
                        </div>
                      </div>
                    ) : locked > 0 ? (
                      <div className="status-callout is-success">
                        <div className="status-callout-head">
                          <span className="status-dot is-green" aria-hidden="true" />
                          <h4 className="status-callout-title">Ready to withdraw</h4>
                        </div>
                        <p className="status-callout-desc">
                          Debt is zero. You can withdraw{" "}
                          <strong>{formatUsd(locked)} MSTK</strong>.
                        </p>
                        <div className="console-cta-row">
                          <button
                            type="button"
                            className="btn btn-primary btn-block"
                            onClick={onWithdraw}
                            disabled={busy || wrongNetwork}
                          >
                            {busy
                              ? "Waiting for wallet…"
                              : `Withdraw ${formatUsd(locked)} MSTK`}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="status-callout is-neutral">
                        <div className="status-callout-head">
                          <h4 className="status-callout-title">No stock locked</h4>
                        </div>
                        <p className="status-callout-desc">
                          Deposit MSTK to get a {allowanceRateLabel} USDG allowance.
                        </p>
                        <div className="console-cta-row">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setActiveStep("deposit")}
                          >
                            Open Deposit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {actionError && (
                <p className="field-error dash-error" role="alert">
                  {actionError}
                </p>
              )}

              <p className="status dash-status" aria-live="polite" aria-atomic="true">
                {statusLine}
              </p>

              <p className="loan-note dash-footnote">
                {allowanceCap > 0
                  ? `Your ${formatUsd(
                      allowanceCap
                    )} spending line is USDG from the cash pool. Your stock was not sold.`
                  : "Spending USDG from the cash pool is a loan against locked stock. Your stock is not sold."}
              </p>
            </section>

            {/* Live Vault Activity Ledger */}
            <section className="dash-activity" aria-labelledby="activity-heading">
              <div className="activity-head">
                <div className="activity-title-group">
                  <h3 id="activity-heading" className="activity-title">
                    Recent Activity
                  </h3>
                  <span className="activity-badge">Robinhood Testnet</span>
                </div>
                {activityLog.length > 0 && (
                  <button
                    type="button"
                    className="btn-link-clear"
                    onClick={() => {
                      setActivityLog([]);
                      try {
                        sessionStorage.removeItem("paytree_activity");
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Clear Log
                  </button>
                )}
              </div>

              {activityLog.length === 0 ? (
                <div className="activity-empty">
                  <div className="activity-empty-dot" aria-hidden="true" />
                  <div className="activity-empty-copy">
                    <p className="activity-empty-title">No transactions this session</p>
                    <p className="activity-empty-sub">
                      Deposits, spends, repayments, and withdrawals show here with
                      explorer links.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="activity-list">
                  {activityLog.map((item) => (
                    <li key={item.id} className="activity-item">
                      <div
                        className="activity-badge-dot"
                        data-type={item.type}
                        aria-hidden="true"
                      />
                      <div className="activity-main">
                        <span className="activity-name">{item.title}</span>
                        <span className="activity-detail">{item.detail}</span>
                      </div>
                      <div className="activity-meta">
                        <time className="activity-time tabular">
                          {formatTime(item.timestamp)}
                        </time>
                        {item.hash && (
                          <a
                            href={getTxUrl(item.hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="activity-link"
                          >
                            View on explorer
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Protocol Specs & Trust Strip */}
            <section className="dash-specs" aria-label="Vault parameters">
              <div className="spec-card">
                <span className="spec-label">Allowance</span>
                <span className="spec-val tabular">{allowanceRateLabel}</span>
                <span className="spec-sub">Of locked notional</span>
              </div>
              <div className="spec-card">
                <span className="spec-label">Spend token</span>
                <span className="spec-val">USDG</span>
                <span className="spec-sub">From vault pool</span>
              </div>
              <div className="spec-card">
                <span className="spec-label">Withdraw</span>
                <span className="spec-val">If debt is 0</span>
                <span className="spec-sub">Stock not sold on spend</span>
              </div>
              <div className="spec-card">
                <span className="spec-label">Vault Contract</span>
                <a
                  href={getAddressUrl(ADDRESSES.vault)}
                  target="_blank"
                  rel="noreferrer"
                  className="spec-contract-link"
                >
                  <span className="spec-val tabular">
                    {shortAddress(ADDRESSES.vault)}
                  </span>
                  <span className="spec-sub">View on Blockscout</span>
                </a>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="footer shell">
        <p className="footer-lead">Paytree</p>
        <p className="footer-sub">
          Arbitrum Open House Singapore Buildathon · Robinhood testnet
        </p>
      </footer>
    </div>
  );
}
