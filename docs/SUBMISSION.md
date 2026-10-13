# Pendiente submission

## English description — 150 words

Pendiente lets someone abroad buy a meal for a person back home. The stall is paid when the recipient presents a meal card. The buyer chooses a stall, approves its listed price, and shares the card through family.

The stall scans the paper card or types its backup code. A successful scan pays only the stall chosen at purchase. The buyer’s meal page then shows Served, with an optional plate photo.

The same card cannot pay twice. If unused, the money returns after the deadline. Our public demo uses testnet play dollars, with a two-minute expiry.

We have verified QR payment, typed-code payment, and an automatic return on Stellar. Each has a public payment link and a balance check. The stall needs no XLM because the server pays serving fees.

Future work includes Circle USDC on the public network and approved cash-out providers for stalls. These remain future work only.

## Español

Pendiente permite comprar una comida para alguien en tu tierra. El local cobra cuando la persona presenta su tarjeta. El comprador elige un local, aprueba el precio y comparte la tarjeta con su familia.

El local escanea la tarjeta o escribe su código. El dinero solo puede llegar al local elegido. El comprador ve el estado Servido y una foto opcional del plato.

La tarjeta funciona una sola vez. Si nadie la usa, el dinero vuelve al comprador. Esta demo usa dólares de prueba y un plazo de dos minutos.

## How it works

1. Choose a stall and connect a testnet wallet.
2. Get 10 play dollars, then approve the listed meal price.
3. Download the full card image or share it by phone.
4. Scan it at the counter, or type the 16-character code.

## Why Stellar

Our final live serve took 6.91 seconds. A measured serving fee was 0.0017041 XLM. The built-in Stellar asset tool (SAC) moves the USDC play dollars. These are demo-issued dollars, not Circle-issued USDC.

Anchors are companies that can exchange digital dollars for cash. Approved cash-out providers are future work; no cash-out service is connected here.

## Links and real work

- [Testnet site](https://pendiente.54-154-121-30.sslip.io/?practice=0)
- [Free local practice](https://pendiente.54-154-121-30.sslip.io/?practice=1)
- [Public proof](https://pendiente.54-154-121-30.sslip.io/proof)
- Locker: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`
- See [verified payments](VERIFIED.md). No public-network meals are claimed.
- Owner still supplies the public repo link and video link.

## 60-second judge walkthrough

0–15 seconds: open the testnet site, choose the stall and connect a funded testnet wallet.

15–30 seconds: approve the meal price and download its card.

30–45 seconds: open the counter on another phone. Scan the card, serve the meal, and show the payment link.

45–60 seconds: show the meal page, then scan the card again to show its refusal.

The owner’s physical phone run and plate photo still need to be recorded. Automated balance checks and local-browser tests have passed.
