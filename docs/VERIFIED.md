# Testnet records

These values were read from the test network on 13 October 2026. The public network was not used.

## Locker

- Contract: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`
- Token: `CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z`
- Admin: `GCI6L6ALZVMFEKAVFWDCRTFYBCD6DGRSMSTUVLN4KOMJEQSEQJQVGHNL`
- Refund time: 120 seconds on this demo locker.
- Wasm hash: `038d9397e46c030d0f9b8d28daab5c26fb3481b2604abe5891d8d4284b2a7a65`

Deploy: [upload](https://stellar.expert/explorer/testnet/tx/37ff45d56d03fceec0b7f354119c36a6a9c0d5a4c8cb8c65f47955933e36d19b), [contract](https://stellar.expert/explorer/testnet/tx/4efad9801383b18e4a266863350db0ad659d8f96c2e8bec454db01e0dca8ffca), [setup](https://stellar.expert/explorer/testnet/tx/f27a8e0b0c56ef1ecd85d6e5d067c29c60b2e6890dfbab2ec1e5980e73ecbade).

The setup call was:

```text
stellar contract invoke --id CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ --source-account pendiente-testnet --network testnet -- init --admin pendiente-testnet --usdc CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z --refund_seconds 120
```

The read result was:

```json
{"admin":"GCI6L6ALZVMFEKAVFWDCRTFYBCD6DGRSMSTUVLN4KOMJEQSEQJQVGHNL","next_meal":1,"refund_seconds":120,"usdc":"CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z"}
```

The demo stall is registered as stall 1. Its play-dollar payout is `GA2O376KN75M436CZB4RG6H6FI3N5RZZGBATG5KR4UL5PGMZCUPUWVJT`.

```text
stellar keys address pendiente-stall-testnet
GA2O376KN75M436CZB4RG6H6FI3N5RZZGBATG5KR4UL5PGMZCUPUWVJT
```

[Trustline](https://stellar.expert/explorer/testnet/tx/80cbbe543c43178e6323daab94a6e88e0fa79a3401840e24c93bf53a269aca62) and [stall registration](https://stellar.expert/explorer/testnet/tx/835e3edc4297469c86227f104c985d6f953502152cf1af1d9c991022b13bb491).

## Full live journey

Command: `node scripts/e2e-testnet.mjs`, run on the VPS against the public HTTPS server.

```text
trust https://stellar.expert/explorer/testnet/tx/cc5e7d1604c7c41dcba861d10a16dfe07b1d49eb930452d39056e1689c05c6cf
fund https://stellar.expert/explorer/testnet/tx/29b80d46c7088eb1880b87af5bd3510b6512eecb6d9566e3837849387fb7d60c
buy https://stellar.expert/explorer/testnet/tx/0d612a656aeb075968c9569f3a9329e5a33268f1fe69fc59abbfe7f52aea06f0
QR serve https://stellar.expert/explorer/testnet/tx/85f5303ca0aea3f059f8c19a2302b61bf9ba8c9b07af43c8eb0a1e12d65aad9c
buy https://stellar.expert/explorer/testnet/tx/22c54c10f55c6c876f7e86f1fef591aa448b24d06b2e194a736c05ca14cc1ad8
backup serve https://stellar.expert/explorer/testnet/tx/b2a8e9b8f3c36a65d2eeba808106937fcc07ab917272462d720707266a042164
buy https://stellar.expert/explorer/testnet/tx/281c8648895d00a8f4733b49152078ebaf3a427fd4e311682fc08adb4a9a996c
Waiting for the 120-second expiry and automatic return
automatic return https://stellar.expert/explorer/testnet/tx/ec2121068ffa224024e597a3d662246a75fce85e16064a798ea292d5bb5595f0
buy https://stellar.expert/explorer/testnet/tx/e05d664fa528ca6ee8fa433cf4f316f6e53bf4cc756b4b5abdb53260b681d5c3
Wrong code refused; meal remains Waiting
PASS: QR serve, backup serve, automatic return, wrong code refusal
```

The tests compare the stall balance before and after serving, and the buyer balance before buying and after returning. Both comparisons passed.

## Retry and timing checks

Three further testnet meals were served while fixing and measuring retries:

- [Buy](https://stellar.expert/explorer/testnet/tx/73f2497ab0acc2f08c33ad8d1aa676ec6b8693185d4a219f5ea529255efdaf6f), [serve](https://stellar.expert/explorer/testnet/tx/f7e17c574b23c5f73b3c944b11bad8bcc3ebfeb12655a9b8a5599fc4fd155007). Serve took 15.91 seconds before optimization.
- [Buy](https://stellar.expert/explorer/testnet/tx/ad4bf72ebdd53918d416239f10fce61d1aeac0495fa85ba08c58fad55252d371), [serve](https://stellar.expert/explorer/testnet/tx/974acc3e2b705ff6c065d7f106813b2037ac38c62345e866d81ff6fa74241806). Signed-buy replay returned the same meal.
- [Buy](https://stellar.expert/explorer/testnet/tx/2992f6428a222b3b8a8632d12da643bdeab6e4d6ad92952d13edef7826bac498), [serve](https://stellar.expert/explorer/testnet/tx/c5a2cf6db57a066fb1bb47910e7cbc913c23a0274e769c74775a5f5154856a7a). The optimized serve took 6.91 seconds.

Command: `E2E_ONLY_SERVE=1 node scripts/e2e-testnet.mjs`.

```text
buy API seconds 17.65
serve API seconds 6.91
PASS: measured buyer payment and QR serve
```

The buy timing includes preparing, submitting, and verifying an identical signed-payment replay. It is not a claim of five-second buying.

The RPC returned SUCCESS for the first buy, first QR serve, typed-code serve and first automatic return. Measured fees were:

| Action | Ledger | Fee in stroops | Fee in XLM |
| --- | --- | --- | --- |
| First buy | 5165506 | 992793 | 0.0992793 |
| QR serve | 5165510 | 17041 | 0.0017041 |
| Typed-code serve | 5165516 | 17041 | 0.0017041 |
| Automatic return | 5165555 | 16818 | 0.0016818 |

Fees were read with `rpc.Server.getTransaction(hash)`, from `resultXdr.fee_charged`. No dollar conversion or universal fee claim is made.

## Final public check

The fourth meal, used to test a wrong code, later [returned automatically](https://stellar.expert/explorer/testnet/tx/de00ea623fce8b8857345cde67dcc05a44ae79862b4e4477831167cda2038838).

The public `/api/health` and `/api/proof` returned:

```json
{"ok":true,"network":"testnet","contract":"CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ","ledger":5175268}
{"bought":7,"served":5,"returned":2,"waiting":0,"paidCents":1500,"returnedCents":600}
```

## Corrected token setup

The earlier token `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` reports symbol `native`. It is XLM, not USDC. The earlier locker is superseded and must not be presented as a dollar demo.

The new token is play-USDC issued by the existing testnet admin. It is not Circle-issued USDC.

```text
issuer=$(stellar keys address pendiente-testnet)
stellar contract asset deploy --asset "USDC:$issuer" --source-account pendiente-testnet --network testnet
CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z
```

[Token deployment](https://stellar.expert/explorer/testnet/tx/8257e17e3343c49cfb8f497166638c8001f28a8436137e5e5425bea1f3b204c2).

```text
stellar contract invoke --id CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z --source-account pendiente-testnet --network testnet -- symbol
"USDC"
```
