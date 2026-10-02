# Commit signing

Every commit in `gubbins` must carry a valid SSH signature from a key
listed in [`/.allowed_signers`](../.allowed_signers). Verification is
**offline and forge-independent** — it needs only `git` and a checkout,
never GitHub or any hosting service.

## Trust anchor: `.allowed_signers`

`.allowed_signers` is committed at the repo root, in OpenSSH's
[allowed-signers format][fmt]. One line per identity permitted to sign:

```
foss@dtbiedrzycki.com namespaces="git" ssh-ed25519 AAAA... dtbiedrzycki's DevBot
```

Because it is version-controlled, its own history is signed. The first
commit both is signed by the first key **and** adds that key to the
file — a self-attesting root of trust, like a self-signed root CA. Every
later signer is added by a commit that an already-trusted signer signed,
so the trust set only grows through signed history.

[fmt]: https://man.openbsd.org/ssh-keygen.1#ALLOWED_SIGNERS

## Verifying (anyone, any time)

```sh
git verify-commit HEAD                    # one commit
bash scripts/verify-signatures.sh        # every commit reachable from HEAD
bash scripts/verify-signatures.sh origin/main..HEAD
```

`scripts/verify-signatures.sh` points `git` at `.allowed_signers`
itself, so it works in a fresh clone with no `git config` and no
network. Exit non-zero means at least one commit is unsigned or signed
by a key not in the file.

## Contributing a new signer

Add your public-key line to `.allowed_signers` in your first PR. That
commit must be signed by a key already in the file; a maintainer whose
key is listed merges it. From then on your own commits verify.

## Enforcement layers

Every layer runs the same `scripts/verify-signatures.sh`, so they all
check the same thing — every commit signed by a key in `.allowed_signers`
(SSH) or `.allowed_pgp_keys.asc` (GitHub's PGP key for web-UI merges) —
at different points. None depends on a specific forge.

| Layer | Binding? | Where it runs |
|---|---|---|
| `.githooks/pre-commit` | Advisory (skipped by `--no-verify`) | Your clone, once `scripts/setup-signing.sh` has set `core.hooksPath` |
| `.githooks/pre-push` | Advisory (skipped by `--no-verify`) | Your clone, on `git push` |
| `.githooks/reference-transaction` | Advisory (`--no-verify` does **not** skip it; bypass with `git -c core.hooksPath= …`) | Your clone, whenever a local branch moves: merge, pull, fast-forward, `fetch src:dst`, `reset`, `branch -f`, commit. Checks the whole incoming range |
| `verify-signatures` CI job | **Binding** for changes merged via CI, once it is a required status check on `main` | Any CI runner (`.github/workflows/ci.yml` here) |
| `.githooks/pre-receive` | **Binding** — the push is rejected | A self-hosted mirror's bare repo (see below) |

The client hooks catch mistakes early but are bypassable by design; the
CI job and `pre-receive` are the gates that actually hold.

The `reference-transaction` hook is used instead of git's built-in
`merge.verifySignatures` / `pull.verifySignatures`, which setup does not
enable: they check only the tip commit, and in a clone they can verify
only SSH signatures, so they rejected every GitHub web-UI merge, and
`git fetch src:dst` skipped them entirely.

## Self-hosted mirror operators

GitHub ignores custom `pre-receive` hooks (hence the CI job). On a bare
repo you control — Gitea, GitLab CE, Forgejo, plain SSH — install the
hook to hard-reject unsigned pushes:

```sh
cp .githooks/pre-receive /path/to/gubbins.git/hooks/pre-receive
chmod +x /path/to/gubbins.git/hooks/pre-receive
```

It is self-contained: it reads `.allowed_signers` from the pushed tip,
so it works with no worktree and no configuration.

## Setup (per clone)

```sh
cp .devcontainer/secrets/signing.env.example .devcontainer/secrets/signing.env
# edit signing.env: SIGNING_NAME, SIGNING_EMAIL
bash scripts/setup-signing.sh
```

This generates a passphrase-less `ed25519` key under
`.devcontainer/secrets/` (git-ignored, persisted across dev-container
rebuilds via the bind mount), adds your identity to `.allowed_signers`,
and sets repo-local git config: sign every commit and tag, and use
`.githooks/` (which verifies every branch update). It touches no global
git config.

The one-liner equivalent, if your key already exists and is in
`.allowed_signers`:

```sh
git config --local gpg.format ssh \
 && git config --local user.signingkey "$PWD/.devcontainer/secrets/signing_ed25519.pub" \
 && git config --local commit.gpgsign true \
 && git config --local gpg.ssh.allowedSignersFile "$PWD/.allowed_signers" \
 && git config --local core.hooksPath .githooks
```

## Optional: GitHub "Verified" badge

Purely cosmetic and not required. Add the public key at
<https://github.com/settings/ssh/new> as a **Signing Key**, on an
account where the signing email is a verified address. GitHub then shows
existing commits as Verified too.
