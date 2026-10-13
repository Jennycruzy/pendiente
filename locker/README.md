# Pendiente locker

The locker is written in Rust for Stellar. Keep this directory on the VPS or another machine with Rust and the Stellar CLI.

## Test the locker

```sh
. "$HOME/.cargo/env"
cd /home/ubuntu/pendiente/locker
cargo test
```

The 20 tests cover the price floor, one-time serving with the QR preimage,
serving with the backup preimage, wrong preimages, expiry, refunds, paused
stalls, payout changes, buyer authorization, public views, and the waiting
balance. They use a real Stellar Asset Contract in the test environment.

## Build the WebAssembly file

```sh
. "$HOME/.cargo/env"
cd /home/ubuntu/pendiente/locker
stellar contract build
```

The output is `target/wasm32v1-none/release/pendiente_locker.wasm`. The Stellar CLI sets the required target and build flags.

Do not deploy this file to the real network until the breaker has signed off and the owner has supplied funded accounts.

## Practice deployment

The deployed testnet locker and its checks are recorded in
`docs/VERIFIED.md`. The VPS keeps the test identity under the alias
`pendiente-testnet`. Its secret is not stored in this repository.
