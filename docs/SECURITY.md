# Card safety

The QR card carries a random 32-byte secret. Only its fingerprint is stored in the locker. The public meal page never contains the secret.

The backup code has 16 characters from a 32-character alphabet. That is 32^16 = 2^80, about 1.2e24 possible codes. Guessing a $3 meal is not worth the computing cost. The code is turned into a separate preimage, so either the QR card or the typed code works once.

A dishonest stall can redeem only with a card preimage. It cannot redirect the money: the locker copied the payout account when the meal was bought. A card holder can redeem without food being handed over; the chain cannot verify a physical plate. Anyone can call return after expiry.

The server stores fingerprints, names and optional messages. It receives the preimage during serving but must never store or log it. It cannot redirect funds. It can delay serve and return requests, so the public chain record remains the final check.

The card says to keep it like cash. A photograph can be used once at the named stall, so the recipient should share it only with the person serving the meal.
