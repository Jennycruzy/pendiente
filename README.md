# Pendiente

Buy a meal for someone back home. The stall only gets paid when the plate is served.

![A v2 meal card in local practice](docs/card-scan.png)

Try it: [testnet site](https://pendiente.54-154-121-30.sslip.io/?practice=0) · [free local practice](https://pendiente.54-154-121-30.sslip.io/?practice=1) · [proof page](https://pendiente.54-154-121-30.sslip.io/proof).

## How it works

1. **Buy.** Choose a stall and approve its listed meal price.
2. **Card.** Send the meal card on WhatsApp or print it.
3. **Scan.** The stall scans the card when the plate is ready.
4. **Paid.** The stall receives the price. You see the plate photo.

## Why Stellar

- Our final test serve took 6.91 seconds.
- The measured serving fee was 0.0017041 XLM, Stellar’s fee coin.
- Anyone can check the public payment record.

## What is real

Five testnet meals were served, including [QR](https://stellar.expert/explorer/testnet/tx/85f5303ca0aea3f059f8c19a2302b61bf9ba8c9b07af43c8eb0a1e12d65aad9c), [typed code](https://stellar.expert/explorer/testnet/tx/b2a8e9b8f3c36a65d2eeba808106937fcc07ab917272462d720707266a042164), and the [timed test](https://stellar.expert/explorer/testnet/tx/c5a2cf6db57a066fb1bb47910e7cbc913c23a0274e769c74775a5f5154856a7a). An unused meal [returned automatically](https://stellar.expert/explorer/testnet/tx/ec2121068ffa224024e597a3d662246a75fce85e16064a798ea292d5bb5595f0). These use play dollars. Real meals served: 0. Unused testnet meals expire after 120 seconds. See [all verified results](docs/VERIFIED.md).

## Under the hood

The locker is a Stellar smart contract (a small program on Stellar that nobody can change). It holds USDC (digital dollars) for each meal. A React and TypeScript site creates cards and shows status. A Node server stores stall details and plate photos. The server sends serve and return calls and pays their tiny network fee. Card secrets stay in the buyer’s browser and on the paper card. The public meal page never includes a secret.

Testnet locker: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`.
