import { Networks } from '@stellar/stellar-sdk'

let kitReady = false

export const practiceMode = import.meta.env.VITE_PRACTICE_MODE !== 'false' || new URLSearchParams(window.location.search).get('practice') === '1' || sessionStorage.getItem('pendiente.practice') === '1'
if (new URLSearchParams(window.location.search).has('practice')) sessionStorage.setItem('pendiente.practice', new URLSearchParams(window.location.search).get('practice') === '1' ? '1' : '0')

async function kit() {
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
  return StellarWalletsKit
}

export async function connectStellarWallet(): Promise<string> {
  if (practiceMode) throw new Error('practice_wallet_not_needed')
  return (await (await kit()).authModal()).address
}

export async function signStellarTransaction(xdr: string, address: string): Promise<string> {
  const networkPassphrase = import.meta.env.VITE_STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET
  const result = await (await kit()).signTransaction(xdr, { networkPassphrase, address })
  return result.signedTxXdr
}
