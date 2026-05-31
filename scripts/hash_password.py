#!/usr/bin/env python3
"""
Hash an admin password into the format expected by the Worker
(`worker/src/auth.js` → `verifyPassword`):

    pbkdf2_sha256$100000$<salt_b64url>$<hash_b64url>

Usage:
    python3 scripts/hash_password.py
    python3 scripts/hash_password.py 'my-strong-password'   # one-shot

The output goes into your Cloudflare Worker secret `ADMIN_PASSWORD_HASH`:

    wrangler secret put ADMIN_PASSWORD_HASH
"""
import base64
import getpass
import hashlib
import os
import sys


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def hash_password(plain: str, iterations: int = 100_000) -> str:
    salt = os.urandom(16)
    hashed = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, iterations, dklen=32)
    return f"pbkdf2_sha256${iterations}${b64url(salt)}${b64url(hashed)}"


def main():
    if len(sys.argv) > 1:
        plain = sys.argv[1]
    else:
        plain = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm: ")
        if plain != confirm:
            sys.exit("passwords don't match")
    if len(plain) < 8:
        sys.exit("password must be at least 8 chars")
    print(hash_password(plain))


if __name__ == "__main__":
    main()
