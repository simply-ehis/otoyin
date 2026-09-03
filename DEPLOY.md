# Deploy to Railway

## Quick Deploy (5 minutes)

### 1. Push to GitHub
```bash
git add backend/Dockerfile backend/.dockerignore railway.json DEPLOY.md
git commit -m "feat: add Railway deployment config"
git push
```

### 2. Create Railway Project
1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select your `21-labs` repository
4. Railway will auto-detect the Dockerfile

### 3. Set Environment Variables
In Railway dashboard → Variables tab, add:

```env
# Required for real Stripe (optional — dev mode works without these)
STRIPE_DEV_MODE=1
LICENSE_SIGNING_KEY=your-random-secret-here

# Optional: Stripe test keys (when ready for real payments)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Deploy
Railway auto-deploys on every push to `main`.

## Custom Domain

1. Railway dashboard → Settings → Networking
2. Click "Generate Domain" for a free `*.up.railway.app` URL
3. Or add your custom domain and update DNS

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWENTYLABS_PORT` | No | `17493` | Server port (Railway sets this automatically) |
| `STRIPE_DEV_MODE` | No | `1` | `1` = simulated payments, `0` = real Stripe |
| `STRIPE_SECRET_KEY` | No | - | Stripe test/live secret key |
| `STRIPE_WEBHOOK_SECRET` | No | - | Stripe webhook signing secret |
| `LICENSE_SIGNING_KEY` | No | `otoyin-dev-signing-key` | HMAC key for license signing |

## Health Check

Railway monitors `/health` endpoint. The app is marked healthy when:
- FastAPI starts successfully
- Database connection works
- All routes are registered

## Logs

View logs in Railway dashboard → Deployments → View Logs.

Or use Railway CLI:
```bash
railway logs
```

## Cost

Railway free tier includes:
- $5 credit/month
- ~500 hours of runtime
- 512 MB RAM, 1 vCPU

This backend uses ~200-400 MB RAM at idle, so it fits comfortably in free tier.

## Troubleshooting

**App won't start:**
- Check logs for import errors
- Ensure all env vars are set correctly

**Health check fails:**
- App may need 60+ seconds to start (ML model loading)
- Railway has a 60s start period configured

**Out of memory:**
- Upgrade to Hobby plan ($5/mo) for 1 GB RAM
- Or set `PYTORCH_ENABLE_MPS_FALLBACK=1` to reduce memory
