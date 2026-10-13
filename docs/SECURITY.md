# Card safety

A meal card is worth one plate at one stall. Treat it like cash.

## What the card holds

The QR code carries a random 32-byte secret. The locker stores only a fingerprint of it (its SHA-256), and the public meal page never shows the secret.

The backup code has 16 characters from a 32-character alphabet: 32^16 = 2^80, about 1.2 × 10^24 codes. Guessing one to steal a $3 meal costs far more than the meal. The code maps to its own fingerprint, so either the QR or the typed code can serve the meal, once.

## What a stall can do

A stall can be paid only by presenting a card's secret. It cannot redirect money: the payout account is fixed when the meal is bought. The chain cannot see food, so a card holder could redeem without a plate being handed over. The plate photo is the buyer's check on that.

## What the server can do

The server stores fingerprints, first names, optional messages and the buyer's optional email. It sees the secret while serving and never stores or logs it. It cannot move money anywhere except to the stall or back to the buyer. It could delay a serve or a refund, but anyone can call refund after expiry, and the public chain record is the final word.
