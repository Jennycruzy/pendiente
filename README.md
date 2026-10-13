# Pendiente

Buy a meal for someone back home. The stall only gets paid when the plate is served.

Try it: [live testnet site](https://pendiente.54-154-121-30.sslip.io) · [proof page](https://pendiente.54-154-121-30.sslip.io/proof) · practice is available in the local build.

## How it works

1. **Buy.** Choose a stall and approve its listed meal price.
2. **Card.** Send the meal card on WhatsApp or print it.
3. **Scan.** The stall scans the card when the plate is ready.
4. **Paid.** The stall receives the price. You see the plate photo.

## Why Stellar

- The buyer can approve one meal payment.
- The stall receives the listed price after a valid scan.
- Anyone can check the public payment record.

## What is real

The testnet locker is live and uses play-USDC issued for this demo. Unused meals expire after 120 seconds. Verified meal journeys: 0. The setup links are in [docs/VERIFIED.md](docs/VERIFIED.md). The stall payout choice and complete phone demo are pending.

## Under the hood

The locker is a Stellar smart contract (a small program on Stellar that nobody can change). It holds USDC (digital dollars) for each meal. A React and TypeScript site creates cards and shows status. A Node server stores stall details and plate photos. The server sends serve and return calls and pays their tiny network fee. Card secrets stay in the buyer’s browser and on the paper card. The public meal page never includes a secret.
