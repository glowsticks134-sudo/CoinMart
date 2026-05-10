#!/bin/bash
# CoinMart — push to GitHub
# Run this from the Shell tab: bash push-to-github.sh

REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/glowsticks134-sudo/CoinMart.git"

echo "Fetching remote..."
git fetch "$REMOTE" main

echo "Merging remote changes..."
git merge FETCH_HEAD --no-edit

echo "Pushing to GitHub..."
git push "$REMOTE" main

echo "Done! Check https://github.com/glowsticks134-sudo/CoinMart"
