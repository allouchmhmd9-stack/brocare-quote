#!/usr/bin/env python3
"""Set (or change) one person's password for the Brocare tools.

    python tools/set_password.py zeinab

They type the password twice; it is never shown or saved. Only a PBKDF2-SHA256
fingerprint (with a fresh random salt) is written into users.js, using the same
settings auth.js checks with. Then publish users.js as usual.
"""
import getpass, hashlib, re, secrets, sys
from pathlib import Path

USERS = Path(__file__).resolve().parents[1] / "users.js"
ROUNDS = 310000          # must match ROUNDS in auth.js
MIN_LENGTH = 10


def main():
    args = [a for a in sys.argv[1:] if a != "--visible"]
    if len(args) != 1:
        sys.exit("Usage: python tools/set_password.py <username> [--visible]")
    user = args[0].strip().lower()
    # Typing is hidden by default (nothing shows, not even dots). Some terminals,
    # like the one inside the Claude app, can't hide typing: --visible shows it.
    ask = input if "--visible" in sys.argv else getpass.getpass
    if ask is getpass.getpass:
        print("Type the password and press Enter. Nothing shows while you type; that's normal.")
    text = USERS.read_text(encoding="utf-8")
    line = re.compile(r"^(\s*" + re.escape(user) + r":\s*\{.*?salt:')[0-9a-f]*(',\s*hash:')[0-9a-f]*(')", re.M)
    if not line.search(text):
        known = re.findall(r"^\s*([a-z]+):\s*\{", text, re.M)
        sys.exit(f"No user '{user}' in users.js. Known: {', '.join(known)}")

    pw = ask(f"New password for {user}: ")
    if len(pw) < MIN_LENGTH:
        sys.exit(f"Too short: use at least {MIN_LENGTH} characters (the site is public, so length is what protects it).")
    if pw != ask("Type it again: "):
        sys.exit("The two passwords didn't match. Nothing was changed.")

    salt = secrets.token_hex(16)
    fp = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), ROUNDS).hex()
    USERS.write_text(line.sub(lambda m: m.group(1) + salt + m.group(2) + fp + m.group(3), text, count=1), encoding="utf-8")
    print(f"Password set for {user}. Publish users.js for it to take effect.")


if __name__ == "__main__":
    main()
