# Pendiente locker

The locker is the Stellar smart contract that holds each meal's USDC until the card is scanned or the meal expires. Building it needs Rust and the Stellar CLI.

## Test the locker

```sh
. "$HOME/.cargo/env"
cd locker
cargo test
```

The 20 tests cover the price floor, one-time serving with the QR preimage,
serving with the backup preimage, wrong preimages, expiry, refunds, paused
stalls, payout changes, buyer authorization, public views, and the waiting
balance. They use a real Stellar Asset Contract in the test environment.

## Build the WebAssembly file

```sh
. "$HOME/.cargo/env"
cd locker
stellar contract build
```

The output is `target/wasm32v1-none/release/pendiente_locker.wasm`. The Stellar CLI sets the required target and build flags.

## Testnet deployment

The deployed testnet locker and its checks are recorded in
`docs/VERIFIED.md`. The admin identity is the Stellar CLI alias
`pendiente-testnet`; its secret is never stored in this repository.
