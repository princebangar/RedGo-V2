# Cloudinary → VPS + nginx migration

Images are no longer stored on or served from Cloudinary. They live on the VPS
filesystem and nginx serves them directly — Node never streams image bytes.

```
Browser ──► nginx :443 ──┬── /uploads/*  →  alias /var/www/uploads/   (disk, no proxy)
                         ├── /api/*      →  127.0.0.1:5000            (Node)
                         └── /*          →  Frontend dist
```

Canonical asset host: **https://redgo.in**

## Filename convention

The Cloudinary export flattened each asset's folder path into its filename, and
new uploads keep the same shape so old and new files coexist in one flat directory:

| Cloudinary | On disk | URL |
|---|---|---|
| `food/restaurants/pan/acxjdyl….jpg` | `food_restaurants_pan_acxjdyl….jpg` | `https://redgo.in/uploads/food_restaurants_pan_acxjdyl….jpg` |

`Backend/src/services/storage.service.js` owns this.

## What changed in the code

| File | Change |
|---|---|
| `src/services/storage.service.js` | **New.** Writes to disk, returns `{ secure_url, public_id, filename, … }`. Encodes to WebP q90 via sharp; falls back to original bytes if sharp cannot decode. |
| `src/services/cloudinary.service.js` | Delegating shim, so nothing can push assets back to Cloudinary. |
| `src/config/env.js` | `config.uploadsRoot`, `config.assetBaseUrl`, `config.serveUploadsFromNode`. |
| `src/middleware/upload.js` | **Hardened.** 25MB/file, 20 files/request, image+video MIME allow-list. Previously unbounded `memoryStorage` with no filter. |
| `src/middleware/errorHandler.js` | Maps multer codes to 413/400 instead of 500. |
| `src/app.js` | `/uploads` static mount is dev-only. |
| `src/modules/uploads/routes/upload.routes.js` | Rebuilt on `storage.service`; honours the `folder` field. |
| 4 banner/icon services | `cloudinary.uploader` → `storeImageBuffer`; `destroy` → `deleteStoredAsset`. |
| `landingSettings.service.js` | Hand-rolled `fs.unlink` → `deleteStoredAsset`. |
| restaurant / delivery / userProfile / businessSettings | Import swapped to `storage.service`. |

Explore icons downscale to 400px at upload, replacing the Cloudinary `w_200`
delivery transform.

### Why `UPLOAD_PATH` was centralized

Three call sites resolved it against three different base directories. That only
worked because the value is absolute — the `'uploads/'` default in `env.js` would
have split writes from reads. Everything now uses `config.uploadsRoot`.

## Environment

```ini
UPLOAD_PATH=/var/www/uploads      # nginx must alias /uploads/ to exactly this
ASSET_BASE_URL=https://redgo.in   # baked into every stored URL
# SERVE_UPLOADS_FROM_NODE=false   # defaults: on in dev, off in production
# MAX_UPLOAD_SIZE_MB=25           # keep <= nginx client_max_body_size
```

`ASSET_BASE_URL` must match the host nginx serves `/uploads/` from. Changing the
domain later means re-running the migration over the stored URLs.

## Migration script

`Backend/scripts/migrate-cloudinary-to-local.js` — dry-run by default, `$set` on
changed top-level fields only (never replaces documents), rollback file per
collection written before anything is touched.

```bash
npm run migrate:uploads                       # dry run
npm run migrate:uploads:apply                 # --apply --clean-empty
node scripts/migrate-cloudinary-to-local.js --rollback scripts/migration-out --apply
```

A URL is rewritten only when the mapped file is proven to exist on disk;
anything unmapped is reported and left untouched.

### Rollback files are Extended JSON — this matters

Rollback files are written with `EJSON.stringify`, not `JSON.stringify`.

Plain JSON **cannot represent BSON types**: `Date` degrades to an ISO string and
`ObjectId` to a hex string. An early version of this script used plain JSON, and
restoring from it corrupted 686 `food_items` documents in the backup database —
every `Date` and `ObjectId` nested inside `oldData`/`newData` became a string.
They were repaired from production with `scripts/repair-backup-from-prod.js`.

The script now refuses to restore a rollback file that lacks Extended JSON
markers. **Never hand-edit these files, and never regenerate them with
`JSON.stringify`.**

The forward migration was never affected — it transforms live BSON in place and
leaves non-string values untouched. Verified: 3,054 `food_items` documents, 0
BSON type differences against production after migrating.

## ⚠️ Oversized documents — a pre-existing production risk

`food_items` documents carry a recursive `oldData`/`newData` edit history that
nests inside itself. One document is **15.53 MB against MongoDB's hard 16 MB
limit**:

| _id | name | size |
|---|---|---|
| `69d8e00c3a1561882299a31e` | Chicken Tikka | **15.53 MB** |
| `6a27dfc772f20d024a29f594` | Chole Bhature | 9.11 MB |

This is not caused by the migration — it exists in production today. That
document is ~3% away from being permanently unwritable by any code path, and it
already forced special handling here (updates must be sent one field at a time;
a combined `$set` exceeds the command limit).

**This should be fixed independently of this migration** — the history field
should be capped or moved to its own collection.

The migration script handles it: updates over 6 MB are split per field, and any
field that still fails is written to `scripts/migration-out/write-failures.json`
and reported — never silently skipped.

## Backup DB run — verified

Against `Redgo_Latest_Backup_10aug` with `ASSET_BASE_URL=https://redgo.in`:

```
documents touched : 4,414        URL replacements  : 71,653
unmapped URLs     : 0            broken refs cleared: 42 across 40 files
```

Post-run verification:

- **0** Cloudinary URLs remain
- **71,653** rewritten URLs all resolve to a real, non-empty file on disk
- **0** BSON type differences vs production (3,054 docs compared)
- API responses (`/restaurants`, `/categories/public`, `/under-250`, `/offers`)
  return only `redgo.in/uploads` URLs, 0 Cloudinary references

The 41 zero-byte files were placeholders for assets that already returned
401/404 on Cloudinary. Deleted, and the 42 DB references cleared (scalars → `""`,
array entries dropped) so the existing placeholder UI renders.
`food_restaurants.menuImages` went 56 → 45; 16 restaurant docs had an image
field cleared.

Legacy `publicId` fields still hold the old Cloudinary path. Intentional —
`deleteStoredAsset` flattens them to the correct local filename.

## End-to-end test results

| Check | Result |
|---|---|
| `GET /health` | `{"status":"UP","mongo":"connected"}` |
| `GET /uploads/<file>` | 200, `image/png`, 126,932 bytes |
| `GET /uploads/missing.png` | 404 |
| `GET /uploads/..%2f..%2f.env` | 404 (traversal blocked) |
| `POST /uploads/image` (JPEG) | 200 → WebP, 5,894 → 1,792 bytes, correct flattened filename |
| Uploaded file fetched back | 200, `image/webp` |
| `POST /uploads/image` (.txt) | 400 `Unsupported file type: text/plain` |
| `POST /uploads/image` (30 MB) | 413 `File too large. Maximum 25MB per file.` |

## The live server

```
nginx 1.30.3, `user root`, client_max_body_size 64M (global)
config      /etc/nginx/sites-available/redgo-v2.conf  (symlinked into sites-enabled)
server_name redgoindia.cloud www.redgoindia.cloud redgo.in www.redgo.in
cert        /etc/letsencrypt/live/redgo.in/
frontend    /var/www/redgo-v2
uploads     /var/www/uploads   (root:root, drwxrwxr-x)
repo        ~/redgo-v2         (deploy.sh: git pull → build → pm2 restart)
pm2         redgo-v2 + 5 workers, NODE_ENV=production
disk        182 GB free
```

nginx runs as **root**, so no `chown www-data` is needed — root reads everything.
Keep `/var/www/uploads` as `root:root` with `755`.

Both domains serve the same app from one server block. Stored URLs all point at
`redgo.in`, so images are cross-origin for `redgoindia.cloud` visitors — the
`Access-Control-Allow-Origin` / `Cross-Origin-Resource-Policy` headers in the
uploads block are what make that work. `redgo.in` is chosen because the TLS
certificate is issued for it.

Relative URLs (`/uploads/…`) were considered and rejected: `firebase.service.js`
puts stored image URLs into FCM push notifications as `notification.image`,
which requires an absolute HTTPS URL.

## Production cutover

**Step 0 — push the code.** `deploy.sh` runs `git pull origin main`, so commit
and push this branch first, or the server will deploy the old code.

**Step 1 — back up the database.**
```bash
mongodump --uri "<PROD_MONGODB_URI>" --out ~/redgo-predeploy-$(date +%F)
```

**Step 2 — ship the images** (~0.47 GB, 4,165 files) from your Windows machine:
```bash
rsync -avz --progress /e/appzeto/RedGo-V2/uploads/ root@<vps>:/var/www/uploads/
```
**Never pass `--delete`.** `/var/www/uploads` already holds 3 files uploaded
directly on the VPS — including the fest banner
`image_1786104540574_etov9y.webp`, which is referenced in the database and is
NOT in the Cloudinary export. `--delete` would destroy them.

Then on the VPS:
```bash
chmod -R 755 /var/www/uploads
mv /var/www/uploads/cloudinary_metadata.json ~/cloudinary_metadata.json
ls /var/www/uploads | wc -l      # expect 4167 (4165 shipped + 3 existing - 1 moved)
```

**Step 3 — nginx.** You already have a `location /uploads/` block; replace only
that block with `deploy/nginx/uploads-location.conf`.
```bash
sudo cp /etc/nginx/sites-available/redgo-v2.conf ~/redgo-v2.conf.bak-$(date +%F)
sudo nano /etc/nginx/sites-available/redgo-v2.conf
sudo nginx -t && sudo systemctl reload nginx

curl -I https://redgo.in/uploads/food_explore-icons_rtqliwurzzltua0ru0an.png  # 200
curl -I https://redgo.in/uploads/cloudinary_metadata.json                     # 403
curl -I https://redgo.in/uploads/nope.png                                     # 404
```

**Step 4 — backend env.** In `~/redgo-v2/Backend/.env`:
```ini
UPLOAD_PATH=/var/www/uploads
ASSET_BASE_URL=https://redgo.in
SERVE_UPLOADS_FROM_NODE=false
```

**Step 5 — deploy.**
```bash
cd ~ && ./deploy.sh
pm2 restart ecosystem.config.cjs --update-env
```

**Step 6 — migrate the database.** Dry run first; do not proceed unless
`unmapped URLs: 0`.
```bash
cd ~/redgo-v2/Backend
npm run migrate:uploads                     # dry run
npm run migrate:uploads:apply               # only after reviewing the numbers
```
Keep `scripts/migration-out/` — it is the rollback.

**Step 7 — verify**, then revoke the Cloudinary API key.

### Rollback

```bash
node scripts/migrate-cloudinary-to-local.js --rollback scripts/migration-out --apply
```

Restores the Cloudinary URLs. Only useful while the Cloudinary account is still
live — do not delete the remote assets until you are confident.

## Operational notes

- **Backups.** `/var/www/uploads` is now the only copy of every image. It must be
  in the backup schedule; Cloudinary previously held that second copy.
- **`client_max_body_size 25M`** must be >= `MAX_UPLOAD_SIZE_MB`, or uploads fail
  at the proxy with 413 before Node sees them.
- **Uploaded files must never execute.** The nginx block denies `.php/.js/.html/
  .svg/.sh/…` under `/uploads/`. Do not remove it.
- **Filenames are immutable**, so the 1-year `immutable` cache header is safe.
- **Frontend** `VITE_API_BASE_URL` should point at `https://redgo.in/api/v1` for
  production builds.
