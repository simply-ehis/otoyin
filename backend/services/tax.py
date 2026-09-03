"""Stripe Tax integration — automatic VAT/GST calculation per region.

Uses Stripe Tax to calculate the correct tax amount based on the
customer's location. Stripe Tax handles all tax registration,
filing, and compliance automatically.

Tax rates are determined by:
- Customer IP address (country detection)
- Product type (digital goods)
- Seller location (residence nexus)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# ── Stripe Tax config ────────────────────────────────────────────────
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_DEV_MODE = os.environ.get("STRIPE_DEV_MODE", "") in ("1", "true", "yes")

# ── EU VAT rates (reference for dev mode simulation) ─────────────────
# Standard rates as of 2024. In production, Stripe Tax calculates these.
EU_VAT_RATES: dict[str, dict[str, Any]] = {
    "AT": {"country": "Austria", "rate": 20.0, "name": "USt"},
    "BE": {"country": "Belgium", "rate": 21.0, "name": "BTW/TVA"},
    "BG": {"country": "Bulgaria", "rate": 20.0, "name": "DDS"},
    "HR": {"country": "Croatia", "rate": 25.0, "name": "PDV"},
    "CY": {"country": "Cyprus", "rate": 19.0, "name": "FPA"},
    "CZ": {"country": "Czech Republic", "rate": 21.0, "name": "DPH"},
    "DK": {"country": "Denmark", "rate": 25.0, "name": "Moms"},
    "EE": {"country": "Estonia", "rate": 22.0, "name": "KM"},
    "FI": {"country": "Finland", "rate": 25.5, "name": "ALV"},
    "FR": {"country": "France", "rate": 20.0, "name": "TVA"},
    "DE": {"country": "Germany", "rate": 19.0, "name": "MwSt"},
    "GR": {"country": "Greece", "rate": 24.0, "name": "FPA"},
    "HU": {"country": "Hungary", "rate": 27.0, "name": "AFA"},
    "IE": {"country": "Ireland", "rate": 23.0, "name": "VAT"},
    "IT": {"country": "Italy", "rate": 22.0, "name": "IVA"},
    "LV": {"country": "Latvia", "rate": 21.0, "name": "PVN"},
    "LT": {"country": "Lithuania", "rate": 21.0, "name": "PVM"},
    "LU": {"country": "Luxembourg", "rate": 17.0, "name": "TVA"},
    "MT": {"country": "Malta", "rate": 18.0, "name": "VAT"},
    "NL": {"country": "Netherlands", "rate": 21.0, "name": "BTW"},
    "PL": {"country": "Poland", "rate": 23.0, "name": "VAT"},
    "PT": {"country": "Portugal", "rate": 23.0, "name": "IVA"},
    "RO": {"country": "Romania", "rate": 19.0, "name": "TVA"},
    "SK": {"country": "Slovakia", "rate": 20.0, "name": "DPH"},
    "SI": {"country": "Slovenia", "rate": 22.0, "name": "DDV"},
    "ES": {"country": "Spain", "rate": 21.0, "name": "IVA"},
    "SE": {"country": "Sweden", "rate": 25.0, "name": "Moms"},
}

# ── Other regions with VAT/GST ───────────────────────────────────────
OTHER_TAX_RATES: dict[str, dict[str, Any]] = {
    "GB": {"country": "United Kingdom", "rate": 20.0, "name": "VAT"},
    "NG": {"country": "Nigeria", "rate": 7.5, "name": "VAT"},
    "ZA": {"country": "South Africa", "rate": 15.0, "name": "VAT"},
    "KE": {"country": "Kenya", "rate": 16.0, "name": "VAT"},
    "GH": {"country": "Ghana", "rate": 15.0, "name": "VAT"},
    "IN": {"country": "India", "rate": 18.0, "name": "GST"},
    "BR": {"country": "Brazil", "rate": 17.0, "name": "ICMS"},
    "MX": {"country": "Mexico", "rate": 16.0, "name": "IVA"},
    "JP": {"country": "Japan", "rate": 10.0, "name": "JCT"},
    "KR": {"country": "South Korea", "rate": 10.0, "name": "VAT"},
    "AU": {"country": "Australia", "rate": 10.0, "name": "GST"},
    "NZ": {"country": "New Zealand", "rate": 15.0, "name": "GST"},
    "SG": {"country": "Singapore", "rate": 9.0, "name": "GST"},
    "CA": {"country": "Canada", "rate": 5.0, "name": "GST"},
    "CH": {"country": "Switzerland", "rate": 8.1, "name": "VAT"},
    "NO": {"country": "Norway", "rate": 25.0, "name": "MVA"},
    "TR": {"country": "Turkey", "rate": 20.0, "name": "KDV"},
}

# All known tax jurisdictions
_ALL_TAX_RATES = {**EU_VAT_RATES, **OTHER_TAX_RATES}

# US states with sales tax (for reference)
US_STATES_WITH_TAX = {
    "AL",
    "AZ",
    "AR",
    "CO",
    "CT",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "NE",
    "NV",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
}


def get_tax_rate(country_code: str) -> dict[str, Any] | None:
    """Get the tax rate for a country code.

    Returns dict with rate, name, and display info, or None if no tax applies.
    """
    return _ALL_TAX_RATES.get(country_code.upper())


def calculate_tax_locally(
    amount_usd: float,
    country_code: str,
) -> dict[str, Any]:
    """Calculate tax locally using known rates.

    Used as a fallback when Stripe Tax is not configured, or in dev mode.
    Returns a dict with tax breakdown.
    """
    tax_info = get_tax_rate(country_code)
    if tax_info is None or country_code.upper() == "US":
        # US taxes are state-specific and can't be calculated without full address
        return {
            "subtotal": round(amount_usd, 2),
            "tax_amount": 0.0,
            "tax_rate": 0.0,
            "tax_name": "Tax",
            "country_code": country_code,
            "total": round(amount_usd, 2),
            "estimated": True,
            "note": "US state tax calculated at checkout by Stripe",
        }

    rate = tax_info["rate"]
    tax_amount = round(amount_usd * rate / 100, 2)
    total = round(amount_usd + tax_amount, 2)

    return {
        "subtotal": round(amount_usd, 2),
        "tax_amount": tax_amount,
        "tax_rate": rate,
        "tax_name": tax_info["name"],
        "tax_country": tax_info["country"],
        "country_code": country_code.upper(),
        "total": total,
        "estimated": True,
    }


async def calculate_tax_stripe(
    amount_usd: float,
    country_code: str,
    product_id: str = "",
) -> dict[str, Any]:
    """Calculate tax via Stripe Tax (when configured).

    Falls back to local calculation if Stripe is not available.
    """
    if not STRIPE_SECRET_KEY or STRIPE_DEV_MODE:
        logger.debug("Stripe Tax not available, using local calculation")
        return calculate_tax_locally(amount_usd, country_code)

    try:
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY

        # Create a temporary PaymentIntent to calculate tax
        # Stripe Tax determines the rate based on the customer's location
        intent = stripe.PaymentIntent.create(
            amount=int(amount_usd * 100),  # Stripe uses cents
            currency="usd",
            automatic_payment_methods={"enabled": True},
            shipping={
                "address": {
                    "country": country_code,
                },
                "name": "Tax calculation",
            },
            # Stripe Tax configuration
            payment_method_options={
                "card": {
                    "request_three_d_secure": "any",
                },
            },
            metadata={
                "product_id": product_id,
                "tax_only": "true",
            },
        )

        # Extract tax information
        # Stripe attaches tax calculation to the PaymentIntent
        tax_amount = 0.0
        tax_rate = 0.0
        tax_name = "Tax"

        # Check for automatic_tax
        if hasattr(intent, "automatic_tax") and intent.automatic_tax:
            tax_amount = intent.automatic_tax.get("amount", 0) / 100
            tax_rate = intent.automatic_tax.get("rate", 0)

        # Cancel the temporary intent (we don't want to charge it)
        stripe.PaymentIntent.cancel(intent.id)

        total = round(amount_usd + tax_amount, 2)

        return {
            "subtotal": round(amount_usd, 2),
            "tax_amount": round(tax_amount, 2),
            "tax_rate": round(tax_rate, 2) if tax_rate else 0.0,
            "tax_name": tax_name,
            "country_code": country_code.upper(),
            "total": total,
            "estimated": False,
            "source": "stripe_tax",
        }

    except Exception as e:
        logger.warning("Stripe Tax calculation failed: %s, falling back to local", e)
        return calculate_tax_locally(amount_usd, country_code)


def get_tax_summary(country_code: str) -> dict[str, Any]:
    """Get a summary of tax information for a country.

    Useful for displaying tax info before checkout.
    """
    tax_info = get_tax_rate(country_code)
    if tax_info is None:
        return {
            "country_code": country_code.upper(),
            "has_tax": False,
            "display_text": "No VAT/GST applies",
        }

    return {
        "country_code": country_code.upper(),
        "has_tax": True,
        "tax_name": tax_info["name"],
        "tax_rate": tax_info["rate"],
        "country": tax_info["country"],
        "display_text": f"{tax_info['name']} ({tax_info['rate']}%) applies in {tax_info['country']}",
    }


def get_all_tax_jurisdictions() -> list[dict[str, Any]]:
    """List all supported tax jurisdictions with their rates."""
    result = []
    for code, info in sorted(_ALL_TAX_RATES.items()):
        result.append(
            {
                "country_code": code,
                "country": info["country"],
                "tax_name": info["name"],
                "tax_rate": info["rate"],
            }
        )
    return result
