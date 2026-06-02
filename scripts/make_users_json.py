#!/usr/bin/env python3
"""
Generate the ADMIN_USERS JSON env var for the Cloudflare Worker.

Usage:
    python3 scripts/make_users_json.py chen wilson alice
    → prompts for each user's password, prints the JSON to paste into
      Cloudflare Worker → Settings → Variables and Secrets → ADMIN_USERS (Secret).

Format produced:
    [
      {"username": "chen",   "password_hash": "pbkdf2_sha256$..."},
      {"username": "wilson", "password_hash": "pbkdf2_sha256$..."},
      ...
    ]

After saving the new ADMIN_USERS value in Cloudflare and clicking Deploy,
each user logs in at https://rexpand-webadmin.pages.dev with their own
username + password.
"""
import getpass
import json
import sys

from hash_password import hash_password


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: make_users_json.py <username1> [<username2> ...]")
    users = []
    for name in sys.argv[1:]:
        while True:
            pw = getpass.getpass(f"Password for {name}: ")
            if len(pw) < 8:
                print("  ✗ at least 8 characters, try again")
                continue
            confirm = getpass.getpass(f"Confirm  for {name}: ")
            if pw != confirm:
                print("  ✗ doesn't match, try again")
                continue
            break
        users.append({"username": name, "password_hash": hash_password(pw)})
    print("\n--- 把下面整段(包括 [ ] 方括号)复制到 Cloudflare ADMIN_USERS ---\n")
    print(json.dumps(users, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
