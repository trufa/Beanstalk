import { http, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import { localFork, anvil1 } from './chains';

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!ALCHEMY_KEY) throw new Error('VITE_ALCHEMY_API_KEY is not set');

const MAINNET_RPC = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

const SHOW_DEV = import.meta.env.VITE_SHOW_DEV_CHAINS;

const chains = !SHOW_DEV ? [mainnet] : [localFork, anvil1, mainnet];
const transports = !SHOW_DEV
  ? { [mainnet.id]: http(MAINNET_RPC) }
  : {
      [localFork.id]: http(localFork.rpcUrls.default.http[0]),
      [anvil1.id]: http(anvil1.rpcUrls.default.http[0]),
      [mainnet.id]: http(MAINNET_RPC),
    };

export const config = createConfig({
  // @ts-ignore
  chains,
  // @ts-ignore
  transports,
  connectors: [injected()],
});

export const client = config.getClient();
