<!-- Created: 2026-08-25 10:38 MST (America/Phoenix) -->
# tearsheets

Automated tearsheet archive for a wire photographer's credit line. Finds every
public appearance, caches the images so they outlive the articles, publishes
the result at tearsheets.yourdomain.com.

If you fork this: check your own wire and licensing agreements before
displaying cached images. This deployment's rights situation is not yours.

## Layout

- `schema-*.sql`            D1 schema, paste into the dashboard console
- `worker/`                 single-file harvest Worker + wrangler.toml
- `site/`                   static Pages site, no build step
- `site/review.html`        admin: hashing, clustering, publish (behind Cloudflare Access)
- `site/tests.html`         parser tests against fixtures
- `fixtures/`               saved SerpApi payloads

## Deploy order

1. D1: create database `tearsheets` in dashboard, paste schema into console.
2. R2: create bucket `tearsheets`, attach custom domain (serves /img/* and /data/*).
3. Worker: paste worker file into Quick Edit or push (GitHub Action deploys it).
   Bind DB + IMAGES. Set secrets SERPAPI_KEY, ADMIN_TOKEN. Route it under
   tearsheets.yourdomain.com/api/* so review.html can reach it same-origin.
4. Pages: connect repo, root dir `site/`, no build command.
5. Cloudflare Access: protect /review.html and /api/admin/* , Google login, one email.
6. Dry run: GET /api/run?mode=backfill&engines=news&dry=1 with the admin header.
   Read the report. Then drop dry=1. Then images engine, then web.
7. review.html: hash, cluster dry, eyeball, cluster live, publish.
8. Sheets (optional until ready): create Sheet with Frames + Domains tabs,
   share with the service account email, set SHEETS_SA + SHEET_ID.

## Budget

Backfill ~85 calls once. Steady state ~130/month. Free tier is ~250.
Sequence the backfill news first, verify, then images, then web.
