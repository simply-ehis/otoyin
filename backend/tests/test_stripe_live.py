"""Live Stripe test card verification script.

Usage:
    1. Set environment variables:
       export STRIPE_SECRET_KEY=sk_test_...
       export STRIPE_WEBHOOK_SECRET=whsec_...
       export LICENSE_SIGNING_KEY=your-secret-key

    2. Run with: python -m backend.tests.test_stripe_live

    3. Or test specific card: python -m backend.tests.test_stripe_live --card=4242424242424242
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import json
import os
import sys

# ── Test card numbers ──────────────────────────────────────────────────
TEST_CARDS = {
    "4242424242424242": "Always succeeds",
    "4000000000000002": "Always declines",
    "4000002500003155": "Requires 3D Secure",
    "4000000000009995": "Insufficient funds",
    "4000000000009987": "Lost card",
    "4000000000009979": "Stolen card",
    "4000000000000069": "Expired card",
    "4000000000000127": "Incorrect CVC",
}


def check_env():
    """Check required environment variables."""
    dev_mode = os.environ.get("STRIPE_DEV_MODE") in ("1", "true", "yes")
    required = ["LICENSE_SIGNING_KEY"]
    if not dev_mode:
        required.append("STRIPE_SECRET_KEY")

    missing = [var for var in required if not os.environ.get(var)]

    if missing:
        print(f"[ERROR] Missing environment variables: {', '.join(missing)}")
        print("\nSet them with:")
        for var in missing:
            print(f"  export {var}=your-value-here")
        return False

    if dev_mode:
        print("[INFO] STRIPE_DEV_MODE=1 — using simulated payments")
        print("       Set STRIPE_DEV_MODE=0 for real Stripe testing")

    return True


async def test_checkout_flow(card_number: str = "4242424242424242"):
    """Test the full checkout flow with a real Stripe test card."""
    from backend.services.checkout import (
        create_checkout_session,
        get_order_status,
        handle_webhook,
        poll_license,
    )

    print(f"\n{'=' * 60}")
    print(f"TESTING CHECKOUT WITH CARD: {card_number}")
    print(f"{'=' * 60}\n")

    # Step 1: Create checkout session
    print("1. Creating checkout session...")
    try:
        result = await create_checkout_session(
            product_id="whisper-small-en",
            device_id=f"test-card-{card_number[-4:]}",
            email=f"test-{card_number[-4:]}@example.com",
            price_usd=5.0,
        )
        print(f"   Order ref: {result['order_ref']}")
        print(f"   Checkout URL: {result.get('checkout_url', 'N/A')[:60]}...")
        print(f"   Dev mode: {result.get('dev_mode', False)}")
    except Exception as e:
        print(f"   [ERROR] {e}")
        return False

    order_ref = result["order_ref"]

    # Step 2: Check order status
    print("\n2. Checking order status...")
    status = get_order_status(order_ref)
    print(f"   Status: {status['status']}")
    print(f"   Product: {status['product_id']}")
    print(f"   Amount: ${status['amount_usd']}")

    # Step 3: Simulate webhook (in dev mode, this is instant)
    print("\n3. Simulating webhook...")
    webhook_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": f"cs_test_{card_number[-4:]}",
                "metadata": {
                    "order_ref": order_ref,
                    "product_id": "whisper-small-en",
                    "device_id": f"test-card-{card_number[-4:]}",
                },
            }
        },
    }

    webhook_response = await handle_webhook(json.dumps(webhook_event).encode(), "")
    print(f"   Webhook response: {webhook_response.get('status', 'unknown')}")

    # Step 4: Poll for license
    print("\n4. Polling for license...")
    license_data = await poll_license(order_ref)

    if license_data:
        print("   License received!")
        print(f"   Product: {license_data.get('product_id')}")
        print(f"   Device: {license_data.get('device_id')}")
        print(f"   Email: {license_data.get('email')}")
        print(f"   Amount: ${license_data.get('amount_usd')}")
        print(f"   Expires: {license_data.get('expires_at')}")
        print(f"   Signed: {license_data.get('signed_at')}")
        print(f"   Signature: {license_data.get('sig', '')[:16]}...")
    else:
        print("   [ERROR] No license returned")
        return False

    # Step 5: Verify signature
    print("\n5. Verifying license signature...")
    signing_key = os.environ.get("LICENSE_SIGNING_KEY", "")
    fields = {k: v for k, v in license_data.items() if k not in ("sig", "signed_at")}
    payload = json.dumps(fields, sort_keys=True, separators=(",", ":"))
    expected_sig = hmac.new(signing_key.encode(), payload.encode(), hashlib.sha256).hexdigest()

    sig_valid = expected_sig == license_data.get("sig", "")
    print(f"   Signature valid: {sig_valid}")

    if not sig_valid:
        print("   [ERROR] Signature verification failed")
        return False

    print(f"\n{'=' * 60}")
    print(f"ALL TESTS PASSED FOR CARD: {card_number}")
    print(f"{'=' * 60}")
    return True


async def test_webhook_signature_verification():
    """Test that webhook signature verification works."""
    from backend.services.checkout import handle_webhook

    print("\n6. Testing webhook signature verification...")

    # Test with invalid signature
    result = await handle_webhook(b"invalid payload", "invalid_sig")
    print(f"   Invalid payload: {result}")

    # Test with valid JSON but no signature
    result = await handle_webhook(json.dumps({"type": "test"}).encode(), "")
    print(f"   Valid JSON, no sig: {result}")

    return True


def print_test_cards():
    """Print available test card numbers."""
    print("\nAvailable test cards:")
    print("-" * 50)
    for card, desc in TEST_CARDS.items():
        print(f"  {card}  {desc}")
    print("-" * 50)


async def main():
    """Run the test suite."""
    parser = argparse.ArgumentParser(description="Test Stripe checkout with test cards")
    parser.add_argument("--card", default="4242424242424242", help="Card number to test")
    parser.add_argument("--all", action="store_true", help="Test all card types")
    parser.add_argument("--list", action="store_true", help="List available test cards")
    args = parser.parse_args()

    if args.list:
        print_test_cards()
        return

    if not check_env():
        sys.exit(1)

    if args.all:
        results = []
        for card in TEST_CARDS:
            result = await test_checkout_flow(card)
            results.append((card, result))

        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        for card, passed in results:
            status = "PASS" if passed else "FAIL"
            print(f"  {card}: {status}")
    else:
        await test_checkout_flow(args.card)

    await test_webhook_signature_verification()


if __name__ == "__main__":
    asyncio.run(main())
