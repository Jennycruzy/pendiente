import { Networks } from '@stellar/stellar-sdk'

let kitReady = false

export const practiceMode = import.meta.env.VITE_PRACTICE_MODE !== 'false'

export async function connectStellarWallet(): Promise<string> {
  if (practiceMode) throw new Error('practice_wallet_not_needed')

  const [{ StellarWalletsKit }, { defaultModules }] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit/sdk'),
    import('@creit.tech/stellar-wallets-kit/modules/utils'),
  ])

  if (!kitReady) {
    const network = import.meta.env.VITE_STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET
    StellarWalletsKit.init({ modules: defaultModules() })
    StellarWalletsKit.setNetwork(network as Parameters<typeof StellarWalletsKit.setNetwork>[0])
    kitReady = true
  }

  return (await StellarWalletsKit.authModal()).address
}
