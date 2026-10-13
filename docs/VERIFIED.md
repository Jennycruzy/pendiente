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

No stall has been registered on this new locker yet. A payout account is required before that call and before an end-to-end purchase.

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
