#!/usr/bin/env bash
# One-shot: build delivery pages → create Stripe links → rewire store.
# Usage:
#   export STRIPE_SECRET_KEY=sk_live_...        (or put it in ~/.stripe-key)
#   export DELIVERY_BASE=https://YOURDOMAIN/thanks
#   bash stripe/go-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DELIVERY_BASE:-}" ]]; then
  echo "⚠️  DELIVERY_BASE not set. Buyers won't be redirected to their download after paying."
  echo "    Set it to your deployed store domain, e.g.  export DELIVERY_BASE=https://cardboardcreations.pages.dev/thanks"
  read -r -p "Continue anyway? [y/N] " ok; [[ "$ok" == "y" || "$ok" == "Y" ]] || exit 1
fi

echo "── 1/3  Building delivery pages (downloads + thanks) ──"
node stripe/build-downloads.js
echo; echo "── 2/3  Creating Stripe products, prices, payment links ──"
node stripe/create-links.js
echo; echo "── 3/3  Rewiring store Gumroad → Stripe ──"
node stripe/rewire-store.js live
echo; echo "🎉 Done. Commit + redeploy the store to push the new checkout live."
