# Deploying gubbins to a home server

The production image runs the API and serves the built web app on port 3000.
SQLite lives on the `gubbins-data` volume. The server refuses to start without
`CREATE_SECRET` and `SESSION_COOKIE_SECRET`.

## First deploy

1. Generate the two secrets (run it twice):

   ```sh
   openssl rand -base64 32
   ```

2. Put them in `.env.prod` next to `docker-compose.prod.yml`. Keep the file out
   of git and readable only by you:

   ```sh
   CREATE_SECRET=<first value>
   SESSION_COOKIE_SECRET=<second value>
   ```

   `CREATE_SECRET` is what you type into the create form. `SESSION_COOKIE_SECRET`
   signs cookies; changing it signs every guest out.

3. Build and start:

   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. Point the tunnel (for example `cloudflared`) at `http://127.0.0.1:3000`. The
   container publishes only on loopback, so the tunnel is the one way in. The
   tunnel provides HTTPS; session cookies are marked secure and need it.

Leave `TRUSTED_PROXY_HOPS` unset. Nothing reads it yet.

## Instance settings

Both are optional and read at startup.

- `SOURCE_URL`: where the footer offers the source code (AGPL-3.0). An http(s)
  URL; empty means `https://github.com/dtbiedrzycki/gubbins`. A malformed value
  stops startup. Set it to your fork's URL if you run modified code.
- `PRIVACY_CONTACT`: how guests reach you about their data, shown on `/privacy`
  (an email address or other text). Empty means none is shown.

## Payment handles

Guests pay for group gifts with the Venmo or Zelle handle you enter when you
create the list. Enter at least one if you want group gifts: a list created
without a handle can't have group gifts, and nothing in the app adds or changes
handles later.

- **Venmo:** your username, 5 to 30 letters, digits, `_` or `-`. A leading `@`
  is optional and is dropped.
- **Zelle:** an email address, or a US phone number with 10 digits (a leading
  `1` is fine). Spaces, dashes and brackets in the number are ignored.

## Upgrading

Pull the new code and rerun the `up -d --build` command. The volume persists.

Until go-live the schema is amended in `0001_init` in place, so a schema change
means deleting the database (`docker compose -f docker-compose.prod.yml down -v`).
After go-live every schema change is a real migration, and `down -v` destroys
real data.

## Go-live checklist (manual)

- [ ] The container runs behind the tunnel.
- [ ] Create the list from a phone over HTTPS.
- [ ] Go through the hold and pledge flows on a phone.
- [ ] The Venmo link shows the payment with the amount and item filled in: in the app on a phone that has it, and on Venmo's website on a phone without it and on a computer.
