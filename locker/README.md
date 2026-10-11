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

## Practice deployment

The tested practice locker is live on Stellar testnet:

`CCD3BHXH6WQM7XXU3EWR5S4KW7TQOHBNZ4VTKLJ3HBAFWFUFWB4ULQAR`

It uses a 120-second return time. Meal 1 was served once, and its second serve was refused. Meal 2 returned its full play-money amount after expiry. Meal 3 was bought and served through the Node server with its typed backup code.

The VPS keeps the test identity under the alias `pendiente-testnet`. Its secret is not stored in this repository.

The practice site is live at `https://pendiente.54-154-121-30.sslip.io`.
