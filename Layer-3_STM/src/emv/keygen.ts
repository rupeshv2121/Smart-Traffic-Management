// keygen.ts — `npm run emv:keygen`
// Mints an Ed25519 keypair and persists it to .emv-keys.json so the dispatch
// signer and the junction verifier share keys across processes.

import { writeEmvKeys } from "./emv-keys";

const file = writeEmvKeys();
console.log(`✅ EMV Ed25519 keypair written to ${file}`);
console.log(
  "   • Private key — held by the dispatch authority (signs tokens). Keep secret.",
);
console.log(
  "   • Public key  — distributed to every junction (verifies tokens only).",
);
console.log("   This file is git-ignored; do not commit it.");
