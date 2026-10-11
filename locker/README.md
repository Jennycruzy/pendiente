# Pendiente locker

The locker is written in Rust for Stellar. Keep this directory on the VPS or another machine with Rust and the Stellar CLI.

## Test the locker

```sh
. "$HOME/.cargo/env"
cd /home/ubuntu/pendiente/locker
cargo test
```

The test suite covers buying, serving once, wrong secrets, expiry, refunds, paused stalls, price limits, payout changes, and the waiting balance.

## Build the WebAssembly file

```sh
. "$HOME/.cargo/env"
cd /home/ubuntu/pendiente/locker
stellar contract build
```

The output is `target/wasm32v1-none/release/pendiente_locker.wasm`. The Stellar CLI sets the required target and build flags.

Do not deploy this file to the real network until the breaker has signed off and the owner has supplied funded accounts.
