import { useCallback, useMemo } from "react";
import { getAccount, readContract, waitForTransactionReceipt } from "@wagmi/core";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { formatUnits, isAddress, parseUnits } from "viem";
import { injected } from "wagmi/connectors";
import { ensureRobinhoodChain } from "../ensureChain.js";
import { ADDRESSES, CHAIN_ID, stockAbi, usdgAbi, vaultAbi } from "../contracts.js";
import { wagmiConfig } from "../wagmi.js";

export function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function toUsdNumber(wei) {
  if (wei === undefined || wei === null) return 0;
  return Math.floor(Number(formatUnits(wei, 18)));
}

export function useWallet() {
  const { address, isConnected, chainId, isConnecting } = useAccount();
  const { connect, error: connectError, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchPending } = useSwitchChain();

  const connectWallet = useCallback(async () => {
    await ensureRobinhoodChain();
    connect({ connector: injected(), chainId: CHAIN_ID });
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch {
      await ensureRobinhoodChain();
    }
  }, [connect, switchChainAsync]);

  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  return {
    address,
    isConnected,
    isConnecting: isConnecting || isConnectPending || isSwitchPending,
    connectError,
    wrongNetwork,
    connectWallet,
    disconnect,
    switchNetwork: () => switchChainAsync({ chainId: CHAIN_ID }),
  };
}

export function useVaultState(address) {
  const { data, refetch, isFetching } = useReadContracts({
    contracts: address
      ? [
          {
            address: ADDRESSES.vault,
            abi: vaultAbi,
            functionName: "stockDeposited",
            args: [address],
          },
          {
            address: ADDRESSES.vault,
            abi: vaultAbi,
            functionName: "debtUsdg",
            args: [address],
          },
          {
            address: ADDRESSES.vault,
            abi: vaultAbi,
            functionName: "previewAllowance",
            args: [address],
          },
          {
            address: ADDRESSES.stock,
            abi: stockAbi,
            functionName: "balanceOf",
            args: [address],
          },
          {
            address: ADDRESSES.usdg,
            abi: usdgAbi,
            functionName: "balanceOf",
            args: [address],
          },
          {
            address: ADDRESSES.usdg,
            abi: usdgAbi,
            functionName: "balanceOf",
            args: [ADDRESSES.vault],
          },
          {
            address: ADDRESSES.vault,
            abi: vaultAbi,
            functionName: "ALLOWANCE_BPS",
          },
        ]
      : [],
    query: {
      enabled: Boolean(address),
      refetchInterval: 12_000,
    },
  });

  return useMemo(() => {
    const lockedWei = data?.[0]?.result ?? 0n;
    const debtWei = data?.[1]?.result ?? 0n;
    const allowanceWei = data?.[2]?.result ?? 0n;
    const mstkWei = data?.[3]?.result ?? 0n;
    const usdgWei = data?.[4]?.result ?? 0n;
    const vaultUsdgWei = data?.[5]?.result ?? 0n;
    const allowanceBps = Number(data?.[6]?.result ?? 500n);

    const locked = toUsdNumber(lockedWei);
    const debt = toUsdNumber(debtWei);
    const allowanceCap = toUsdNumber(allowanceWei);
    const spendable = Math.max(0, allowanceCap - debt);
    const mstkBalance = toUsdNumber(mstkWei);
    const usdgBalance = toUsdNumber(usdgWei);
    const vaultUsdg = toUsdNumber(vaultUsdgWei);

    return {
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
    };
  }, [data, refetch, isFetching]);
}

async function waitTx(hash) {
  await waitForTransactionReceipt(wagmiConfig, { hash });
}

export function usePaytreeActions({ spendable, debt, refetch }) {
  const { writeContractAsync, isPending } = useWriteContract();

  const busy = isPending;

  const deposit = useCallback(
    async (amountStr) => {
      const amount = parseUnits(amountStr.replace(/,/g, "") || "0", 18);
      if (amount <= 0n) return null;

      await ensureRobinhoodChain();
      const { address: account } = getAccount(wagmiConfig);
      if (!account) throw new Error("Wallet not connected");

      const allowance = await readContract(wagmiConfig, {
        chainId: CHAIN_ID,
        address: ADDRESSES.stock,
        abi: stockAbi,
        functionName: "allowance",
        args: [account, ADDRESSES.vault],
      });

      if (allowance < amount) {
        const approveHash = await writeContractAsync({
          chainId: CHAIN_ID,
          address: ADDRESSES.stock,
          abi: stockAbi,
          functionName: "approve",
          args: [ADDRESSES.vault, amount],
        });
        await waitTx(approveHash);
      }
      const hash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount],
      });
      await waitTx(hash);
      await refetch();
      return hash;
    },
    [writeContractAsync, refetch]
  );

  const spend = useCallback(
    async (to, amountStr) => {
      if (!isAddress(to)) throw new Error("Invalid recipient address");
      const amount = parseUnits(amountStr.replace(/,/g, "") || "0", 18);
      if (amount <= 0n) throw new Error("Invalid amount");
      if (toUsdNumber(amount) > spendable) {
        const err = new Error("paycheck");
        err.code = "PAYCHECK";
        throw err;
      }
      await ensureRobinhoodChain();
      const hash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "spend",
        args: [to, amount],
      });
      await waitTx(hash);
      await refetch();
      return hash;
    },
    [writeContractAsync, spendable, refetch]
  );

  const repay = useCallback(
    async (amountStr) => {
      const amount = parseUnits(amountStr.replace(/,/g, "") || "0", 18);
      if (amount <= 0n) return null;

      await ensureRobinhoodChain();
      const { address: account } = getAccount(wagmiConfig);
      if (!account) throw new Error("Wallet not connected");

      const usdgAllowance = await readContract(wagmiConfig, {
        chainId: CHAIN_ID,
        address: ADDRESSES.usdg,
        abi: usdgAbi,
        functionName: "allowance",
        args: [account, ADDRESSES.vault],
      });

      if (usdgAllowance < amount) {
        const approveHash = await writeContractAsync({
          chainId: CHAIN_ID,
          address: ADDRESSES.usdg,
          abi: usdgAbi,
          functionName: "approve",
          args: [ADDRESSES.vault, amount],
        });
        await waitTx(approveHash);
      }

      const hash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "repay",
        args: [amount],
      });
      await waitTx(hash);
      await refetch();
      return hash;
    },
    [writeContractAsync, refetch]
  );

  const withdraw = useCallback(async () => {
    if (debt > 0) return null;
    await ensureRobinhoodChain();
    const hash = await writeContractAsync({
      chainId: CHAIN_ID,
      address: ADDRESSES.vault,
      abi: vaultAbi,
      functionName: "withdraw",
    });
    await waitTx(hash);
    await refetch();
    return hash;
  }, [writeContractAsync, debt, refetch]);

  const dripStock = useCallback(async () => {
    await ensureRobinhoodChain();
    const hash = await writeContractAsync({
      chainId: CHAIN_ID,
      address: ADDRESSES.stock,
      abi: stockAbi,
      functionName: "drip",
    });
    await waitTx(hash);
    await refetch();
    return hash;
  }, [writeContractAsync, refetch]);

  return {
    deposit,
    spend,
    repay,
    withdraw,
    dripStock,
    busy,
  };
}
