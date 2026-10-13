# Pendiente

**Buy a hot meal for someone back home in Nigeria. The cook is paid when the plate is served.**

![A Pendiente meal card](docs/card-scan.png)

[Open Pendiente](https://pendiente.isobars.xyz) · [Try it without a wallet](https://pendiente.isobars.xyz/?practice=1) · [Every served meal](https://pendiente.isobars.xyz/proof)

Millions of Nigerians abroad send money home for food, and never see the plate. Pendiente sells the meal itself, at a buka: the small roadside kitchens where most Nigerians eat lunch. Your money waits for one stall and one plate, and it comes back to you if the meal is never eaten.

## How it works

1. **Pick a stall.** Stalls in Lagos, Enugu, Abuja and Ibadan each set one price per plate.
2. **Pay once.** Your wallet approves the price. The money is held for that stall only.
3. **Send the card.** Share the meal card on WhatsApp or print it.
4. **Eat.** The stall scans the card, serves the plate and is paid on the spot. You get a photo of the plate.

If nobody uses the card before it expires, the money returns to you on its own.

## For stalls

No app and no account. Open the counter page on any phone, scan the card or type its 16-character code, and snap the plate. Each card works once, and only at the stall printed on it.

## Why Stellar

- In our timed test, a serve settled in 6.91 seconds.
- The network fee for that serve was 0.0017041 XLM.
- Every payment is public, so anyone can check it.

## Where it stands

Pendiente runs on the Stellar test network with play dollars. So far 7 meals have been bought there: 5 served and 2 returned on expiry. Launching with real money needs Circle USDC on the public network and a cash-out partner for stalls.

## Under the hood

A Rust smart contract on Stellar holds each meal's USDC. It pays the stall's fixed account when a valid card is scanned, or refunds the buyer after expiry. A React site creates cards. A Node server stores stall details and plate photos, and pays the fee for serve and refund calls. The card secret stays in the buyer's browser and on the card; the chain keeps only its fingerprint.

Tests: `cd locker && cargo test` and `npm run smoke:api`. Testnet locker: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`. See [testnet records](docs/VERIFIED.md) and [card safety](docs/SECURITY.md).
