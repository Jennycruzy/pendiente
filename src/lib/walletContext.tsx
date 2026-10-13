import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { buyerBalance } from './api'
import { connectStellarWallet, practiceMode } from './wallet'

const addressKey = 'pendiente.wallet.v1'

type WalletState = {
  address: string
  balance: number | null
  connecting: boolean
  error: string
  connect: () => Promise<string>
  disconnect: () => void
  refresh: () => Promise<void>
}

const WalletContext = createContext<WalletState | null>(null)

function storedAddress() {
  try { return localStorage.getItem(addressKey) || '' } catch { return '' }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState(() => practiceMode ? '' : storedAddress())
  const [balance, setBalance] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (target: string) => {
    if (!target || practiceMode) return
    try { setBalance((await buyerBalance(target)).balance) } catch (cause) { console.error('Balance read failed', cause); setBalance(null) }
  }, [])

  useEffect(() => { void load(address) }, [address, load])

  const connect = useCallback(async () => {
    setConnecting(true); setError('')
    try {
      const next = await connectStellarWallet()
      setAddress(next)
      try { localStorage.setItem(addressKey, next) } catch { /* the address is kept in memory for this visit */ }
      return next
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'wallet_error')
      throw cause
    } finally { setConnecting(false) }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(''); setBalance(null)
    try { localStorage.removeItem(addressKey) } catch { /* nothing stored */ }
  }, [])

  const refresh = useCallback(() => load(address), [address, load])

  return <WalletContext.Provider value={{ address, balance, connecting, error, connect, disconnect, refresh }}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet needs WalletProvider')
  return value
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`
export const dollars = (stroops: number | null) => stroops === null ? '—' : `$${(stroops / 10_000_000).toFixed(2)}`
