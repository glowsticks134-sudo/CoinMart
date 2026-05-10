#!/bin/bash
# CoinMart — force push Replit code to GitHub
# Run from the Shell tab: bash push-to-github.sh

REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/glowsticks134-sudo/CoinMart.git"

echo "Force-pushing to GitHub (this will overwrite whatever is on GitHub with your Replit code)..."
git push --force "$REMOTE" main

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Done! Your code is live at:"
  echo "   https://github.com/glowsticks134-sudo/CoinMart"
else
  echo ""
  echo "❌ Push failed. Make sure your GITHUB_TOKEN secret is set correctly."
fi
