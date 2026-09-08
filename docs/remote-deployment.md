# Free remote deployment

The project supplies the upload API, admin/public pages, and deployment files. Live deployment still requires the owner's Aiven, Render, and Cloudflare accounts. Keep all three on their free plans. Use their provided subdomains; no paid domain is needed.

## Architecture

Cloudflare Pages serves the public site, scorekeeper, admin page, and the latest published statistics JSON. Render runs the Python API. Aiven runs MySQL. Visitors read only static files from Cloudflare; they do not wake the API or database.

Uploads and admin changes commit to MySQL first. The API then attempts to publish a fresh snapshot. If publishing fails, the database change remains saved and the admin page reports pending publication. Retry publication from the admin page. A deleted game may remain visible in the previous public snapshot until publication succeeds.

Render Free sleeps after 15 minutes without inbound traffic and wakes on a new request, taking about a minute. Aiven may pause inactive services and require the owner to restart them. The scorekeeper retains its saved upload while either service is unavailable. No keepalive jobs are configured and no service promises uninterrupted uptime.

Provider references, checked 2026-09-08:
- [Aiven free MySQL limits](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier): 1 GB disk, 1 GB RAM, one CPU, 76 connections.
- [Render free-service limits](https://render.com/docs/free): 750 shared instance hours/month, bandwidth/build quotas, sleeping and ephemeral files. Without a payment method, exhausted quotas can suspend service rather than incur bandwidth charges. Do not enable paid upgrades or overages.
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [Direct Upload deployment](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

## 1. Create the remote MySQL service

Create an Aiven **MySQL Free** service, not a time-limited paid trial. Copy its host, port, username, and database connection information privately. Download the service CA certificate. The Aiven port may differ from 3306.

Keep your existing local MySQL database and game exports as backups. Do not expose your computer's MySQL port to the internet. Aiven hosts a separate database; your existing local tables do not transfer automatically.

Use verified TLS for remote connections. The backend accepts a CA file through MYSQL_SSL_CA and verifies the server certificate and hostname. In Render, add a secret file named aiven-ca.pem; its path is /etc/secrets/aiven-ca.pem.

## 2. Create a Cloudflare Pages Direct Upload project

Create a Pages project using **Direct Upload**, with production branch main. Use the supplied project.pages.dev address. Do not connect Git-based builds to this project: the backend publishes complete site artifacts together with statistics.

Create a Cloudflare API token with Account → Cloudflare Pages → Edit permission restricted to the relevant account. Record the account ID and Pages project name. Keep the API token only in the backend environment. A Cloudflare account is for you as the owner; public viewers and scorekeepers need no Cloudflare account.

## 3. Deploy the Python backend on Render

Push the reviewed implementation branch to your repository, then create the service from render.yaml or select a Docker web service with the **Free** plan. The Dockerfile installs the API, Gunicorn, Node, and Wrangler at build time. No package download occurs during a game upload.

Set the environment variables listed in [.env.example](../.env.example):
- PUBLIC_API_BASE: the Render HTTPS service URL.
- ALLOWED_ORIGINS: the exact Cloudflare Pages origin, without a trailing slash.
- SECRET_KEY: a randomly generated long secret used to sign expiring PIN sessions.
- SCOREKEEPER_PIN and ADMIN_PIN: different private numeric PINs; use at least eight digits. Never include them in public site configuration.
- MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_SSL_CA: Aiven connection details and CA path.
- CLOUDFLARE_PROJECT, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: publishing access.

Use Render's secret environment fields and secret-file interface; do not commit values or send them in chat. The application reads environment variables directly; copying .env.example to .env does not load them automatically.

The health endpoint /api/health checks that the API process is running. It does not prove the database is initialized or publishing credentials work. Render filesystem changes are temporary; persistent state resides in MySQL and published files reside in Cloudflare.

## 4. Initialize and seed the remote schema

Run the explicit remote migration command documented in [remote API setup](remote-api.md) from your local msba terminal using the Aiven connection settings and verified CA file. This is separate from starting the web service.

Export the university roster from your local scorekeeper, then use the existing importer to preview and apply it to Aiven:
```powershell
conda activate msba
python -m scorekeeper_pipeline import-roster "C:\path\to\university_roster.csv" --user YOUR_AIVEN_USER --host YOUR_AIVEN_HOST --port YOUR_AIVEN_PORT --database scorekeeper
python -m scorekeeper_pipeline import-roster "C:\path\to\university_roster.csv" --user YOUR_AIVEN_USER --host YOUR_AIVEN_HOST --port YOUR_AIVEN_PORT --database scorekeeper --apply
```
The local terminal prompts for the password when MYSQL_PASSWORD is unset. Set MYSQL_SSL_CA to the local downloaded CA certificate path before connecting. Importing the roster first establishes the permanent IDs required for game uploads.

To carry existing completed local games into the remote system, open them in the hosted scorekeeper using a JSON backup and upload each finished game once. This uses the validated atomic upload path and preserves game and player IDs. Do not import synthetic test games into the remote service.

## 5. Publish the site

Install the pinned Wrangler CLI locally once if performing initial publishing from your computer:
```powershell
npm install --global wrangler@4.130.0
conda activate msba
node scripts/build-site.cjs --output tests/artifacts/initial-site --api-base https://YOUR_API.onrender.com
wrangler pages deploy tests/artifacts/initial-site --project-name YOUR_PAGES_PROJECT --branch main
```
Provide CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID privately through your terminal environment. This initial artifact contains empty statistics. **Only use an empty initial deployment before the first real publication**, otherwise it would temporarily replace the published results.

Once the website is available, open admin.html, enter your admin PIN, and choose **Publish latest statistics**. Later uploads and edits attempt publication automatically. Always publish through the API after database initialization; do not deploy an old downloaded snapshot over newer results.

The standalone Front.html in the repository remains usable offline. The artifact builder embeds only the public backend URL into the hosted copy. It never copies database credentials, PINs, environment files, private backups, or local game exports.

## 6. Confirm the real deployment

1. Open the public page without a PIN and confirm game results load.
2. Open the scorekeeper, use Manage → Download shared roster, then create and finish a game.
3. Upload with the shared scorekeeper PIN. Confirm saved and published status separately.
4. Reload the scorekeeper and confirm the uploaded game cannot be reopened by the recorder.
5. Use the admin PIN to void a play, adjust a player's minutes, and publish. Confirm the public page reflects the correction.
6. Delete and restore a game through the admin page, publishing each change.
7. After the backend sleeps, reopen public statistics: results should load directly from Cloudflare. Verify the next API request can wake Render.
8. Preserve a JSON backup of the recording device and regular MySQL exports.

Record actual provider deployment results in remote-verification.md. Local tests alone do not verify cloud account permissions, TLS configuration, resource quotas, or a Docker build.

## Working locally

```powershell
conda activate msba
python -m pip install -r requirements.txt
node --test tests/engine.test.cjs tests/team.test.cjs tests/remote.test.cjs
python -m unittest discover -s tests -p "test_remote*.py" -v
python tests/run_mysql_tests.py
node build.cjs
node tests/browser-smoke.cjs
node scripts/build-site.cjs --output tests/artifacts/remote-site --api-base https://api.example
node tests/browser-remote.cjs
```

The remote browser test mocks API transport and uses a local HTTP server. MySQL integration tests use a temporary loopback-only instance, never your localhost:3306 production database. Docker is required only to test the deployment container locally; Render can build the supplied Dockerfile.
