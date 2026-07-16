# Redis + BullMQ — Live Safe Setup

**Goal:** Enable Redis/BullMQ on production **without** breaking orders, payments, FCM, or causing 502 crash-loops.

**Last updated:** 2026-07-16

---

## Why this matters

Without Redis/BullMQ you see:

```text
[WARN] BullMQ order queue not available. Job not added.
```

API still works, but background jobs (order dispatch timeouts, payment follow-ups, tracking persistence, etc.) are skipped.

---

## Safety guarantees (code)

After this harden:

| Situation | What happens |
|-----------|----------------|
| Redis down at API boot | API **still starts**; queues skipped |
| Redis blip while API running | Job add fails **softly** (warn, no throw) — HTTP flow continues |
| Worker starts before Redis | Worker **waits ~60s**, then exits `0` (PM2 restarts gently) |
| Socket Redis adapter fails | Falls back to in-memory adapter |

Order / payment / OTP / notification **request paths must not 500** because of Redis.

---

## LIVE enable — exact order (do not skip steps)

### Step 0 — Deploy latest backend code first

```bash
cd /root/redgo-v2/Backend   # your real path
git pull
# ensure ecosystem.config.cjs and queue harden files are present
```

### Step 1 — Install & start Redis (before changing .env)

```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
# MUST print: PONG
```

If `PONG` nahi aaya → **.env mat badlo**, pehle Redis fix karo.

### Step 2 — Update live Backend `.env` only after PONG

```env
REDIS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
BULLMQ_ENABLED=true
```

Save file.

### Step 3 — Restart API + start workers (PM2)

**Option A — recommended (ecosystem):**

```bash
cd /root/redgo-v2/Backend

# Stop old single process if needed (keeps name conflict free)
pm2 delete redgo-v2 || true

pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

**Option B — keep existing `redgo-v2` and add workers:**

```bash
cd /root/redgo-v2/Backend

# 1) Put new env in place, then:
pm2 restart redgo-v2 --update-env

# 2) Start workers (once)
pm2 start src/queues/workers/order.worker.js --name redgo-worker-order
pm2 start src/queues/workers/payment.worker.js --name redgo-worker-payment
pm2 start src/queues/workers/notification.worker.js --name redgo-worker-notification
pm2 start src/queues/workers/tracking.worker.js --name redgo-worker-tracking
pm2 start src/queues/workers/otp.worker.js --name redgo-worker-otp
pm2 save
```

### Step 4 — Verify (must pass before telling client “fixed”)

```bash
redis-cli ping
pm2 status
pm2 logs redgo-v2 --lines 40 --nostream
```

**Good logs:**

```text
Successfully connected to Redis
BullMQ Redis connection established
BullMQ queues initialized: ...
Order worker started
```

**Bad — stop and rollback env if you see crash loop:**

```text
EADDRINUSE
restart count climbing every second
```

### Step 5 — Smoke test live flows (2–3 min)

1. Delivery boy online + receive/accept order  
2. Restaurant gets FCM / socket update  
3. User places small order (or staging) if possible  
4. Confirm logs: **no** continuous `order queue not available`  
5. `curl -I https://redgoindia.cloud/api/v1/...` (health / known public) still 200/401 not 502  

---

## Rollback (if anything weird)

```bash
# In Backend/.env:
REDIS_ENABLED=false
BULLMQ_ENABLED=false

pm2 restart redgo-v2 --update-env
pm2 stop redgo-worker-order redgo-worker-payment redgo-worker-notification redgo-worker-tracking redgo-worker-otp
# optional: pm2 delete those workers
```

API returns to previous behavior (jobs skipped, but app online). **Zero downtime path.**

---

## Local / Windows dev

Keep:

```env
REDIS_ENABLED=false
BULLMQ_ENABLED=false
```

Unless you install Redis locally. Do **not** copy live `true` into local without Redis — unnecessary.

---

## Checklist

- [ ] `redis-cli ping` → PONG  
- [ ] Live `.env` REDIS + BULLMQ true  
- [ ] Latest code deployed  
- [ ] `redgo-v2` online, restart count stable  
- [ ] Workers online  
- [ ] No 502 on app  
- [ ] Order accept / FCM still works  
- [ ] `pm2 save` done  

---

## Notes

- Enabling Redis alone without workers = jobs enqueue but sit until workers run.  
- Always run **API + workers** together on live.  
- Nginx 502 usually means Node down/crash — Redis warn alone does not cause 502.
