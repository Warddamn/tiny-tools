#!/bin/bash
# @author AVRG3
# Stores an npm access token so publishing works. Prompts for the token; never echoes it.
set -u
echo
echo "Get a token first: npmjs.com -> avatar -> Access Tokens -> Generate New Token"
echo "  -> Granular Access Token -> Packages and scopes: Read and write -> Generate"
echo
printf "Paste your npm token (starts with npm_) and press Enter: "
read -rs TOKEN
echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then echo "Nothing pasted. Run this again once you have the token."; exit 1; fi
case "$TOKEN" in
  PASTE_YOUR_TOKEN_HERE) echo "That is the placeholder text, not your token. Copy the real one from npmjs.com."; exit 1 ;;
  npm_*) ;;
  *) echo "Warning: a token normally starts with 'npm_'. Trying it anyway." ;;
esac
npm config set //registry.npmjs.org/:_authToken="$TOKEN"
echo "Saved. Checking with npm..."
if WHO=$(npm whoami 2>&1); then
  echo "SUCCESS - logged in to npm as: $WHO"
else
  echo "npm did not accept it: $(echo "$WHO" | head -2 | tr '\n' ' ')"
  echo "Check the token has 'Read and write' permission, then run this again."
  exit 1
fi
