# Stripe Testing Guide

## Prerequisites

1. **Stripe Account**: Sign up at https://dashboard.stripe.com
2. **Stripe CLI**: Install from https://stripe.com/docs/stripe-cli
3. **Test Keys**: Get from https://dashboard.stripe.com/test/apikeys

## Quick Start

### 1. Set Environment Variables

```bash
# In backend/.env
STRIPE_DEV_MODE=0
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
LICENSE_SIGNING_KEY=your-random-secret-here
```

### 2. Start Local Server

```bash
just dev-backend
# or
cd backend && python -m uvicorn backend.main:app --reload --port 17493
```

### 3. Forward Webhooks with Stripe CLI

```bash
# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:17420/marketplace/webhook/stripe

# Copy the webhook signing secret (whsec_...) from the output
# Add it to your .env file
```

### 4. Test with Test Cards

```bash
# Run the test script
python -m backend.tests.test_stripe_live

# Or test specific card
python -m backend.tests.test_stripe_live --card=4242424242424242

# List all test cards
python -m backend.tests.test_stripe_live --list
```

## Test Card Numbers

| Card Number | Behavior |
|-------------|----------|
| `4242 4242 4242 4242` | Always succeeds |
| `4000 0000 0000 0002` | Always declines |
| `4000 0025 0000 3155` | Requires 3D Secure |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 9987` | Lost card |
| `4000 0000 0000 9979` | Stolen card |
| `4000 0000 0000 0069` | Expired card |
| `4000 0000 0000 0127` | Incorrect CVC |

**For all test cards:**
- Use any future expiration date (e.g., `12/34`)
- Use any 3-digit CVC (e.g., `123`)
- Use any ZIP code (e.g., `12345`)

## Testing Flow

### Step 1: Create Checkout Session

```bash
curl -X POST http://localhost:17420/marketplace/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "whisper-small-en",
    "device_id": "test-device-001",
    "email": "test@example.com"
  }'
```

Response:
```json
{
  "order_ref": "ord_abc123...",
  "checkout_url": "https://checkout.stripe.com/...",
  "product_id": "whisper-small-en",
  "amount_usd": 5.0
}
```

### Step 2: Complete Payment

Open `checkout_url` in browser and use test card `4242 4242 4242 4242`.

### Step 3: Webhook Fires

Stripe CLI forwards the webhook to your local server:
```
stripe listen --forward-to localhost:17420/marketplace/webhook/stripe
```

You should see:
```
webhook --- checkout.session.completed
```

### Step 4: Poll for License

```bash
curl http://localhost:17420/marketplace/license/ord_abc123...
```

Response:
```json
{
  "product_id": "whisper-small-en",
  "device_id": "test-device-001",
  "email": "test@example.com",
  "amount_usd": 5.0,
  "expires_at": "lifetime",
  "sig": "abc123..."
}
```

## Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create signed license |
| `charge.refunded` | Revoke license |

## Troubleshooting

**"No such customer" error:**
- Make sure you're using test mode keys (`sk_test_...`)
- Check that the card number is valid

**Webhook not received:**
- Ensure `stripe listen` is running
- Check the webhook signing secret matches

**License not available:**
- Check server logs for errors
- Verify the order exists in memory
- Ensure webhook was processed successfully

## Production Checklist

Before going live:

1. [ ] Set `STRIPE_SECRET_KEY=sk_live_...`
2. [ ] Set `STRIPE_WEBHOOK_SECRET=whsec_...` (from Stripe dashboard)
3. [ ] Create webhook endpoint in Stripe dashboard
4. [ ] Select events: `checkout.session.completed`, `charge.refunded`
5. [ ] Set `STRIPE_DEV_MODE=0`
6. [ ] Test with real card (small amount)
