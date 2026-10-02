import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodTestnet } from "./chains.js";

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
  },
});
