# Free public hosting on Oracle Cloud

This runs the whole site (Superset with Pages and Presentations) on one
**Oracle Cloud Always Free** VM. It costs nothing, as long as you stay within the
Always Free limits:

| Piece | What it does |
| --- | --- |
| Postgres 16 | Superset's own data, plus the example data |
| Redis 7 | Caches |
| Superset | This repository, built on the VM (`Dockerfile` target `lean`, plus the Postgres driver) |
| Caddy | HTTPS with a free Let's Encrypt certificate, on a free `sslip.io` hostname |

What visitors get:

- Anyone can browse published dashboards, pages and presentations without an account. The site opens on the Presentations list.
- Creating and editing needs an account. Admins create accounts in **Settings → List Users**.
- Only admins can use Presenton, because it spends credits. Everyone else can view Presenton decks and download the `.pptx`, but can't edit or export them.

## 1. Create the VM (in the Oracle console)

1. Sign up at <https://www.oracle.com/cloud/free/>.
   - Oracle asks for a card to verify your identity. Always Free resources don't charge it.
   - Pick a home region close to your users. You can't change it later.
2. Go to **Compute → Instances → Create instance**.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere `VM.Standard.A1.Flex` with 4 OCPUs and 24 GB of memory. This is the Always Free maximum. If Oracle reports "out of capacity", try another availability domain, or 2 OCPUs and 12 GB.
   - **Networking:** keep "Assign a public IPv4 address" on.
   - **SSH keys:** choose "Paste public keys" and paste your public key, for example `~/.ssh/superset_oracle.pub`.
3. Open the web ports:
   1. Open the instance's subnet, then its **Security list**.
   2. Under **Add ingress rules**, add source `0.0.0.0/0`, TCP, destination ports `80,443`.
4. Note the instance's **public IP address**.

## 2. Prepare the VM and deploy (over SSH)

```bash
ssh -i ~/.ssh/superset_oracle ubuntu@<public-ip>
git clone https://github.com/debnathSD/superset-tiptap.git && cd superset-tiptap/deploy/oracle
./setup-vm.sh            # Docker, firewall rules for 80/443, swap; then log out and back in
./deploy.sh <ip-with-dashes>.sslip.io     # e.g. 203-0-113-10.sslip.io
```

The first deploy takes 30 to 60 minutes, because it builds the frontend and loads the examples.

The first run writes `.env` with new random secrets. That file is readable only by its owner and is never committed. It holds:

- `SUPERSET_SECRET_KEY`
- the Postgres password
- the `admin` password

The site is then at `https://<ip-with-dashes>.sslip.io/`.

**Set your own admin password:**

```bash
cd ~/superset-tiptap/deploy/oracle && docker compose exec superset superset fab reset-password --username admin
```

**Turn on the AI engines:** add the keys to `.env`, then run `docker compose up -d superset`:

- `PRESENTON_API_KEY=...` for Presenton (admins only);
- `ANTHROPIC_API_KEY=...` for Claude.

**Demo content (optional):** put a `demo-content.json` file in `deploy/oracle/content/`, then run `docker compose run --rm init`. It imports pages and presentations, with chart references matched by chart name.

## Updates

```bash
cd ~/superset-tiptap && git pull && deploy/oracle/deploy.sh
```

`init` runs on every deploy and is safe to repeat. It runs the migrations, re-syncs the roles and the read-only Public role, and skips data that is already loaded.

## Good to know

- **Backups:** Postgres data lives in the `pgdata` Docker volume. To back it up:
  ```bash
  docker compose exec db pg_dump -U superset superset > backup.sql
  ```
- **Logs:**
  ```bash
  docker compose logs -f superset
  ```
- **Idle VMs:** Oracle may reclaim Always Free VMs that stay idle for a long time. A public site with visitors stays active.
- **Your own domain:** point its DNS A record at the VM's IP, set `SITE_ADDRESS` in `.env`, and run `docker compose up -d caddy`.
