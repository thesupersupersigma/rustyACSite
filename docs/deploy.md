# Deploying rustyac.com (task 05)

**Plain English:**
- Coolify on tsss-server builds the site from GitHub with the repo's `Dockerfile` and serves it with
  nginx.
- The existing Cloudflare Tunnel carries rustyac.com to it, and Cloudflare caches the heavy files at
  the edge.
- The temporary redirect to rustyac.thesupersupersigma.com goes away.
- The preview with the Kunos pack stays on its own subdomain, behind Cloudflare Access.

Do the parts in order. Each one ends with a check.

---

## 0. Before you start (on the Windows PC)

1. **Commit** what's still uncommitted (the new logo):
   ```
   cd C:\Users\thesupersupersigma\Desktop\project5\rustyACSite
   git status
   git add src/assets/logo.png src/assets/logo-mark.png public/favicon.png public/apple-touch-icon.png public/og/rustyac-og.webp
   git commit -m "feat(brand): the new rustyAC logo"
   ```
2. **Push the site** (create the empty repo `thesupersupersigma/rustyACSite` on GitHub first if it
   doesn't exist):
   ```
   git push -u origin master --follow-tags
   ```
3. **Push the game repo** too, so the site shows the newest release (the build reads GitHub's
   release list):
   ```
   cd C:\Users\thesupersupersigma\Desktop\project5\rustyAC
   git push --follow-tags
   ```
   Wait for the release workflow to finish (the `-windows-x64.zip` and `-web.zip` appear on the
   release).

**Check:** https://github.com/thesupersupersigma/rustyACSite shows the tags `v0.1.0`–`v0.4.0`, and
the rustyAC Releases page shows the newest version as "Latest".

---

## 1. Coolify: the app

Coolify's dashboard is LAN/Tailscale only: open `http://10.0.0.140:8000` (or the Tailscale address).

1. **Projects** → open a project (or make one called `rustyac`) → **+ New** → **Public Repository**
   (or **Private Repository (with GitHub App)** if the repo is private).
2. Repository: `https://github.com/thesupersupersigma/rustyACSite`, branch `master`.
3. **Build Pack: Dockerfile.** Ports Exposes: `80`.
4. **Domains:** set them **the same way as your other tunnelled apps** (the anime site, for
   example), for both `rustyac.com` and `www.rustyac.com`. Cloudflare ends HTTPS at its edge, so
   most tunnel setups use `http://rustyac.com` here, so Traefik doesn't try to get a Let's Encrypt
   certificate. Copy whatever your working apps use.
5. *(Optional)* **Environment Variables** → add `GITHUB_TOKEN`, tick **Build Variable**. Use a
   fine-grained token with no permissions at all (it only raises GitHub's rate limit). Skip it if
   unsure; one build makes one API call.
6. **Deploy.** Watch the build log:
   - `npm ci` downloads `ffmpeg-static`'s binary from GitHub. That's normal.
   - `prebuild` prints the preview version it fetched and verified.
   - `astro build` lists the pages.

**Check:** the deployment ends "Healthy/Running". From the server:
```
curl -sI -H "Host: rustyac.com" http://localhost/ | head -5
```
gives `200` (use whatever host/port your Traefik listens on).

**If the build fails:**
- **"Illegal instruction"** (the Xeons have no AVX): say which package. sharp and Node itself work
  on SSE4.2 CPUs.
- **GitHub unreachable from the build:** the build still passes (fallback data, `/play` shows
  "unavailable"); fix the network and redeploy.

---

## 2. Cloudflare: send rustyac.com to the tunnel

All in the Cloudflare dashboard.

1. **Remove the temporary redirect.**
   - In the `rustyac.com` zone: **Rules → Redirect Rules**: delete (or turn off) the rule sending
     rustyac.com to `rustyac.thesupersupersigma.com`.
   - Check **Rules → Page Rules** too, in case it lives there.
2. **Clear old DNS records.** In **DNS → Records**, delete any `A`/`AAAA`/`CNAME` for `rustyac.com`
   (`@`) or `www` that only existed for the redirect. The tunnel adds its own; a leftover record
   makes the next step fail with "record already exists".
3. **Tunnel hostnames.**
   - Go to **Zero Trust → Networks → Tunnels** → your tunnel → **Public Hostname** → **Add a public
     hostname**:
     - Subdomain empty, domain `rustyac.com`, service: **the same target as your other apps** (for
       example `HTTP` → `localhost:80` / your Traefik).
     - Again with subdomain `www`.
   - This creates proxied CNAME records to the tunnel.
4. **www → apex.**
   - Go to **Rules → Redirect Rules → Create rule** (or the "Redirect from WWW to root" template).
   - When: hostname equals `www.rustyac.com`.
   - Then: dynamic, `concat("https://rustyac.com", http.request.uri.path)`, status **301**,
     preserve query string.
5. **HTTPS:** **SSL/TLS → Edge Certificates → Always Use HTTPS: On.**
6. **Cache rule** (so the 3–4 MB scene is served by Cloudflare, not your upload):
   - Go to **Caching → Cache Rules → Create rule**, named "rustyac.com static".
   - When: hostname equals `rustyac.com`.
   - Then:
     - **Eligible for cache**
     - **Edge TTL: Use cache-control header if present, bypass cache if not**
     - **Browser TTL: Respect origin**
   - nginx already sends the right headers:
     - `/_astro/` → 1 year, immutable
     - `/models/`, `/textures/`, `/og/` → 30 days (the scene loads them with `?v=<version>`, so a new
       version is a new URL)
     - HTML → `no-cache`
   - So pages update on every deploy, and the heavy files stay at the edge.
7. *(Optional)* **Analytics & Logs → Web Analytics → Add a site** → `rustyac.com`, automatic setup
   (no cookies, no banner needed).

**Checks** (from any PC):
```
curl -sI https://rustyac.com/ | findstr /i "HTTP cf-cache-status cache-control"
curl -sI https://www.rustyac.com/some/path | findstr /i "HTTP location"
```
- The first gives `200`, `cache-control: no-cache`.
- The second gives `301` → `https://rustyac.com/some/path`.

Open https://rustyac.com, scroll to the car, open DevTools → Network. Reload twice:
`f2004.glb?v=…` should show `cf-cache-status: HIT` the second time.

---

## 3. The preview with the pack stays private

`rustyac.thesupersupersigma.com` (Coolify, the Kunos preview pack from `/storage/rustyac/preview`)
must stay behind Cloudflare Access.

1. Go to **Zero Trust → Access → Applications**. Check there is a **self-hosted** application
   covering `rustyac.thesupersupersigma.com`, with a policy that only allows your email.
2. If not, add one:
   - **Add an application → Self-hosted** → domain `rustyac.thesupersupersigma.com`.
   - Policy **Allow**, Include: **Emails** → yours.
   - Login method: one-time PIN.

**Check:** open it in a private window: you should get Cloudflare's login page, not the preview.

---

## 4. Google Search Console

1. Go to https://search.google.com/search-console → **Add property → Domain** → `rustyac.com`.
2. Verify through the DNS TXT record. Cloudflare can add it for you ("Verify with Cloudflare"), or
   paste the TXT record in **DNS → Records**.
3. **Sitemaps** → submit `https://rustyac.com/sitemap-index.xml`.
4. **URL Inspection** → `https://rustyac.com/` → **Request indexing**.

---

## 5. Updating the site later

- **Site change:** push to `master`, then in Coolify press **Redeploy** (or set up the automatic
  deploy, if added later).
- **New rustyAC release:** the site picks up the newest version, its downloads and its browser
  preview **on the next build**. Press **Redeploy** after a release is published.
- **Devlog post:** set `draft: false` in `src/content/devlog/<post>.md`, push, redeploy.

---

## 6. Final checklist

- [ ] https://rustyac.com loads, the top bar and footer show the new logo
- [ ] https://www.rustyac.com redirects to https://rustyac.com
- [ ] the F2004 scene loads on the PC and the Chromebook (`?debug=1`); the burnout, pop, pit stop
  and sound work
- [ ] /download shows the newest release and the button downloads the zip
- [ ] /play → Launch → the preview opens and asks for your Assetto Corsa folder
- [ ] a second reload shows `cf-cache-status: HIT` on the model
- [ ] the preview subdomain asks for a Cloudflare login in a private window
- [ ] Search Console: the sitemap is "Success"
- [ ] share https://rustyac.com in Discord: the preview card shows the F2004 image
- [ ] the rustyAC README links to https://rustyac.com
