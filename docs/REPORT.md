# Pendiente build report

The reviewed testnet build is deployed. Five testnet meals were served and two unused meals returned. No real-network meal is claimed. Physical phone testing and the owner's recording remain outstanding.

## D1–D7

| Item | Result | Fix |
| --- | --- | --- |
| D1 | Fixed and exercised on testnet. Buyer signs; identical signed-payment replay returns the same meal. Credentials remain available during a retry. | `server/stellar.mjs:90`, `src/App.tsx:173` |
| D2 | Fixed. Demo stall 1 has its own testnet payout. Admin creation/update uses the stored chain ID and validates the payout/trustline. | `server/index.mjs:49`, `scripts/seed-stall.mjs:6` |
| D3 | Fixed. Purchase price/expiry come from Stellar. Public meal reads refresh status; counter checks and returns use ledger time. Serving relies on the locker's own current checks. | `server/index.mjs:100`, `server/index.mjs:159` |
| D4 | Fixed. Independent random QR secret, 16-character backup, separate fingerprints, v2 cards, and full-card download/share. | `src/lib/crypto.ts:23`, `locker/src/lib.rs:154` |
| D5 | Fixed. Instance/stall/meal TTL renewal and daily storage renewal. | `locker/src/lib.rs:264`, `server/index.mjs:320` |
| D6 | Fixed. No fake waiting count or payment link; local practice is labelled; README uses a genuine v2 screenshot. | `src/lib/api.ts:7`, `docs/card-scan.png` |
| D7 | Fixed. Closed meals are paginated at 20, names are initials, totals are read from Stellar, and photos are files with metadata stripping. | `server/index.mjs:247`, `server/photos.mjs:3`, `server/stellar.mjs:181` |

## Required checks

`npm run check` exited 0:

```text
Plain words check passed (158 README words, 79 Under the hood words).
tsc -b && vite build
993 modules transformed.
built in 1.61s
```

`npm run smoke:api` exited 0. It uses an in-memory database, temporary photo directory, and only the named fakeChain module substitute. Its HTTP server closes on completion.

```text
Request failed: POST /api/meals/meal-1/serve (PayloadTooLargeError)
reconciled meal-2 to Served
```

Those two lines are expected: the oversized upload is refused and the interrupted serve is recovered.

```json
{"ok":true,"checks":["chain stall required","prepare and signed submit","80-bit backup match","ten wrong codes refused","wrong stall refused","early and late invalid returns refused","serve once","second serve refused","public card data hidden","private proof list","20 MB upload refused","fake JPEG and PNG refused","location metadata stripped","server restart recovers photo and date without second payment"]}
```

The suite also asserts refusal of the reviewer's empty WebP file and removal of an unconfirmed payment link.

`cargo test` on the VPS exited 0:

```text
running 20 tests
test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`stellar contract build` on the VPS exited 0:

```text
Wasm Size: 17222 bytes optimized
Wasm Hash: 038d9397e46c030d0f9b8d28daab5c26fb3481b2604abe5891d8d4284b2a7a65
Exported Functions: 11 found
Build Complete
```

The broad repository text scan returns `FAIL` because it also matches compressed Git objects, image bytes, and an npm integrity string. The authored-source scan had no matches. Integrity strings and Git history were preserved. The author/trailer scan returns `ok`. The private-key scan and `git diff --check` had no findings.

## Live checks and values

Final public health returned ledger 5175268. Chain-derived proof totals were:

```json
{"bought":7,"served":5,"returned":2,"waiting":0,"paidCents":1500,"returnedCents":600}
```

- Locker: `CCEWVBHEO7K6GH2C2WVB6RBGPWASFJGGLC67XBYA3VVE6KF6CCLAMNWQ`
- Play-USDC: `CCOLZD3JWJPN4UWS64TO3ZNJQYYYOJQ3QAUVW47GOIVLMXP6HXQ73K6Z`
- Stall payout: `GA2O376KN75M436CZB4RG6H6FI3N5RZZGBATG5KR4UL5PGMZCUPUWVJT`
- Secret files are outside the repository and mode 600.

The initial full live test printed:

```text
PASS: QR serve, backup serve, automatic return, wrong code refusal
```

The final timing/replay test printed:

```text
buy API seconds 17.65
serve API seconds 6.91
PASS: measured buyer payment and QR serve
```

The buy timing includes preparing, buying, and replaying the same signed payment. It is not a five-second buying claim. Serve fees measured 0.0017041 XLM; the first buy cost 0.0992793 XLM including storage. No dollar conversion is claimed.

Every deployment, buy, serve and verified-return link is recorded in [VERIFIED.md](VERIFIED.md). The original four-meal test output is pasted there in full. Five served testnet meals include [QR](https://stellar.expert/explorer/testnet/tx/85f5303ca0aea3f059f8c19a2302b61bf9ba8c9b07af43c8eb0a1e12d65aad9c), [backup code](https://stellar.expert/explorer/testnet/tx/b2a8e9b8f3c36a65d2eeba808106937fcc07ab917272462d720707266a042164), and the [6.91-second serve](https://stellar.expert/explorer/testnet/tx/c5a2cf6db57a066fb1bb47910e7cbc913c23a0274e769c74775a5f5154856a7a). The first [automatic return](https://stellar.expert/explorer/testnet/tx/ec2121068ffa224024e597a3d662246a75fce85e16064a798ea292d5bb5595f0) restored the buyer's full play-USDC balance.

The deployed browser check printed:

```text
PASS: mobile-size local practice, full-card download, formatted backup, one-use refusal, Spanish, genuine v2 screenshot
```

This used headless Chrome with a phone-sized viewport. It is not a physical Android/iPhone or Freighter test.

## Independent review

The separate Breaker reproduced and reviewed fixes for lost buyer responses, interrupted serving, unconfirmed links, local fallback during testnet errors, and malformed image files. Independent API checks passed. Each reported simple JPEG, PNG and WebP bypass has a regression assertion.

Image handling validates structure and strips common location metadata; it is not a full image-pixel decoder. Buyer retry recovery retains credentials in memory while the payment page remains open. The public record proves card possession and payment, not physical food delivery.

## Remaining owner work

1. Complete the actual Freighter/phone journey, scan a printed card, and attach a plate-only photo.
2. Verify physical Android Chrome and iPhone Safari, camera access and actual 4G loading. Camera fallback is the typed code.
3. Record/approve the video and language read-aloud check.
4. Publish the repository yourself and add the repo/video links to the submission copy.

The optional served-email path exists but has not been exercised with configured Postmark credentials. No public-network deployment or fiat cash-out integration was added. Nothing was pushed.

## Setup corrections and limits

The supplied token reported `native`; it was XLM, not USDC. The corrected testnet token is demo-issued play-USDC, not Circle-issued USDC. The old failed mint returned `HostError: Error(Storage, MissingValue)`; that configuration was replaced and the corrected live journeys passed.

The exact broad text-scan command cannot safely treat binary Git files and cryptographic integrity strings as authored words. That check still reports false positives; it was not weakened.

The owner supplies the video. No video link, physical plate photograph, mainnet payment, or device-test result was invented.

## Git log before this report's final save

```text
798063e let testnet links override local practice
c53e209 reject empty WebP frames and retry failed reads
6e67e3b publish measured testnet results and submission copy
78763a5 keep card codes on retries and check the phone layout
4d18116 recover interrupted meal payments and check photos
651b381 record checks and pending demo approval
ef414c7 record verified testnet setup and remaining checks
f74c7f6 share full meal cards and show buyer balances
368767e prepare buyer payments and store real meal records
6d837fd check both meal card codes and renew storage
6a392cd protect internal and runtime files
9b9ca5f separate server fee account
e66a3d7 add served email notice
51ed07f deploy practice site with https
b250ee4 connect practice flow to testnet
c7e0987 tighten locker expiry rules
4b955b6 label wallet modes
896799d add wallet integration boundary
0b9afb9 localize remaining screen text
740a340 add stall photo uploads
2550431 document locker commands
aec15a0 pin site dependencies
805388b prepare stellar locker build
9c505d0 test locker safety rules
0520426 fix locker hash check
cbdcfe5 keep API fallback safe
c75fe0b mark live link as pending
98d1eff tighten practice safeguards
e80d77a keep buyer email private
434ced1 start Pendiente build
```
