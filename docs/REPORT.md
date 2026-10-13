# Build report — 13 October 2026

The build is not signed off. Automated checks pass, but the full wallet-to-stall journey has not run on the corrected locker.

## Defects

| Item | Status | Code |
| --- | --- | --- |
| D1 | Implemented; live buyer journey still unverified | `server/stellar.mjs:76`, `server/index.mjs:142`, `src/App.tsx:176` |
| D2 | Mapping and admin calls implemented; demo stall registration awaits payout approval | `server/index.mjs:49`, `scripts/seed-stall.mjs:6` |
| D3 | Partial: purchase amount and expiry copied from Stellar; returns use ledger time. Public reads and counter checks still use cached status and a local expiry check | `server/index.mjs:173`, `server/index.mjs:222`, `server/index.mjs:294` |
| D4 | Fixed in source and tested: random QR secret, separate 80-bit backup, two fingerprints | `src/lib/crypto.ts:23`, `locker/src/lib.rs:154`, `locker/src/lib.rs:210` |
| D5 | TTL renewal added to instance, stall and meal paths; daily renewal job added | `locker/src/lib.rs:264`, `locker/src/lib.rs:340`, `server/index.mjs:310` |
| D6 | Fake counts and links removed; local practice labelled. README screenshot remains pending | `src/lib/api.ts:7`, `src/components/Layout.tsx:24`, `README.md:20` |
| D7 | Paginated closed meals and private fields implemented; photos stored as files. Waiting total still derives from reconciled DB rows rather than a full chain inventory | `server/index.mjs:230`, `server/index.mjs:96` |

## Checks run

`npm run check` exited 0:

```text
Plain words check passed (157 README words, 76 Under the hood words).
tsc -b && vite build
993 modules transformed.
built in 1.24s
```

`npm run smoke:api` exited 0 and closed its server:

```json
{"ok":true,"checks":["chain stall required","prepare and signed submit","80-bit backup match","wrong code refused","serve once","second serve refused","public card data hidden","private proof list"]}
```

`cargo test --manifest-path locker/Cargo.toml` exited 0:

```text
running 20 tests
test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`stellar contract build` ran on the VPS with Rust loaded and exited 0:

```text
Wasm Size: 17222 bytes optimized
Wasm Hash: 038d9397e46c030d0f9b8d28daab5c26fb3481b2604abe5891d8d4284b2a7a65
Exported Functions: 11 found
Build Complete
```

The exact broad text scan returned `FAIL`: it matches compressed Git objects and an npm integrity string. The source-only scan returned no matches. Package integrity was preserved.

The commit-author and trailer scan returned `ok`.

## Verified network setup

- Locker: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`
- Play-USDC: `CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z`
- [Token deployment](https://stellar.expert/explorer/testnet/tx/8257e17e3343c49cfb8f497166638c8001f28a8436137e5e5425bea1f3b204c2)
- [Locker deployment](https://stellar.expert/explorer/testnet/tx/4efad9801383b18e4a266863350db0ad659d8f96c2e8bec454db01e0dca8ffca)
- [Locker setup](https://stellar.expert/explorer/testnet/tx/f27a8e0b0c56ef1ecd85d6e5d067c29c60b2e6890dfbab2ec1e5980e73ecbade)

Health read after deployment:

```json
{"ok":true,"network":"testnet","contract":"CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ","ledger":5165372}
```

Exact chain reads and setup commands are in `VERIFIED.md`. There are no verified meal links on the corrected locker yet.

## Commits

```text
ef414c7 record verified testnet setup and remaining checks
f74c7f6 share full meal cards and show buyer balances
368767e prepare buyer payments and store real meal records
6d837fd check both meal card codes and renew storage
6a392cd protect internal and runtime files
```

Nothing was pushed.

## Remaining work and owner choice

The spec explicitly requires the owner's decision before creating the stall payout account. Choose a separate testnet-only payout account or supply its public address. No payout account was created while that choice was pending.

After approval: register the stall, run `scripts/e2e-testnet.mjs`, retain all actual meal links, and complete the Freighter phone run with a plate photo. The runner uses throwaway buyer keys in memory. Screenshot, real-phone checks, measured timing and fees, independent sign-off, and final submission copy remain pending.

Photo handling still needs an independent upload check for location data. Browser-generated JPEGs omit location data, but the server must also strip it from direct uploads. The served email is optional and has not been exercised.

## Problems found in the supplied setup

The old token reported symbol `native`; it was XLM, not USDC. An attempted mint failed with `HostError: Error(Storage, MissingValue)`. The corrected demo now uses an admin-issued USDC test asset, not Circle-issued USDC.

The broad repository text scan also examines binary Git files and cryptographic integrity strings. Those are not authored words and cannot be edited safely to satisfy that scan.

A QR secret proves card possession. It cannot prove a physical plate was handed over. The security notes now state that limit.
