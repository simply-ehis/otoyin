"""Currency conversion service with exchangerate.dev as primary source.

Fallback chain: exchangerate.dev → Frankfurter.dev → Frankfurter (self-hosted).
Rates are cached for 4 hours to stay within the 10,000 req/mo free tier.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────────
_cache: dict[str, Any] = {}
_cache_at: float = 0.0
_CACHE_TTL_S = 4 * 3600  # 4 hours

# ── Supported currencies (ISO 4217) ───────────────────────────────────
# Maps region codes (from geolocation) to their local currencies.
REGION_CURRENCY: dict[str, str] = {
    "US": "USD",
    "GB": "GBP",
    "NG": "NGN",
    "ZA": "ZAR",
    "KE": "KES",
    "GH": "GHS",
    "IN": "INR",
    "BR": "BRL",
    "MX": "MXN",
    "JP": "JPY",
    "CN": "CNY",
    "KR": "KRW",
    "DE": "EUR",
    "FR": "EUR",
    "ES": "EUR",
    "IT": "EUR",
    "NL": "EUR",
    "PL": "PLN",
    "SE": "SEK",
    "NO": "NOK",
    "DK": "DKK",
    "CH": "CHF",
    "AU": "AUD",
    "CA": "CAD",
    "NZ": "NZD",
    "SG": "SGD",
    "AE": "AED",
    "SA": "SAR",
    "EG": "EGP",
    "PK": "PKR",
    "BD": "BDT",
    "PH": "PHP",
    "ID": "IDR",
    "MY": "MYR",
    "TH": "THB",
    "VN": "VND",
    "TR": "TRY",
    "RU": "RUB",
    "UA": "UAH",
    "AR": "ARS",
    "CL": "CLP",
    "CO": "COP",
    "PE": "PEN",
}

# ── Region → country name (for display) ────────────────────────────────
REGION_NAMES: dict[str, str] = {
    "US": "United States",
    "GB": "United Kingdom",
    "NG": "Nigeria",
    "ZA": "South Africa",
    "KE": "Kenya",
    "GH": "Ghana",
    "IN": "India",
    "BR": "Brazil",
    "MX": "Mexico",
    "JP": "Japan",
    "CN": "China",
    "KR": "South Korea",
    "DE": "Germany",
    "FR": "France",
    "ES": "Spain",
    "IT": "Italy",
    "NL": "Netherlands",
    "AU": "Australia",
    "CA": "Canada",
    "SG": "Singapore",
    "AE": "UAE",
    "SA": "Saudi Arabia",
}


def _is_cache_fresh() -> bool:
    return (time.monotonic() - _cache_at) < _CACHE_TTL_S and "rates" in _cache


async def _fetch_exchangerate_dev(base: str = "USD") -> dict[str, float] | None:
    """Fetch rates from exchangerate.dev free tier."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.exchangerate.dev/latest",
                params={"base": base},
            )
            if resp.status_code == 200:
                data = resp.json()
                rates = data.get("rates", {})
                if rates:
                    logger.debug("exchangerate.dev: fetched %d rates", len(rates))
                    return {k: float(v) for k, v in rates.items()}
    except Exception as e:
        logger.debug("exchangerate.dev failed: %s", e)
    return None


async def _fetch_frankfurter(base: str = "USD") -> dict[str, float] | None:
    """Fetch rates from Frankfurter.dev (free, no key needed)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.frankfurter.dev/v1/latest",
                params={"base": base},
            )
            if resp.status_code == 200:
                data = resp.json()
                rates = data.get("rates", {})
                if rates:
                    logger.debug("Frankfurter.dev: fetched %d rates", len(rates))
                    return {k: float(v) for k, v in rates.items()}
    except Exception as e:
        logger.debug("Frankfurter.dev failed: %s", e)
    return None


async def get_rates(base: str = "USD") -> dict[str, float]:
    """Get exchange rates with fallback chain and caching."""
    if _is_cache_fresh():
        return _cache["rates"]

    global _cache_at

    # Try sources in order
    rates = await _fetch_exchangerate_dev(base)
    if rates is None:
        rates = await _fetch_frankfurter(base)

    if rates is not None:
        _cache["rates"] = rates
        _cache_at = time.monotonic()
        return rates

    # Return cached even if stale (better than failing)
    if "rates" in _cache:
        logger.warning("All rate sources failed, using stale cache")
        return _cache["rates"]

    # Ultimate fallback: return USD-only
    logger.error("All rate sources failed and no cache available")
    return {"USD": 1.0}


async def convert_price(
    amount_usd: float,
    target_currency: str,
) -> dict[str, Any]:
    """Convert a USD price to target currency.

    Returns dict with converted amount, currency code, and exchange rate.
    """
    if target_currency == "USD":
        return {
            "amount": round(amount_usd, 2),
            "currency": "USD",
            "rate": 1.0,
            "formatted": f"${amount_usd:.2f}",
        }

    rates = await get_rates("USD")
    rate = rates.get(target_currency)
    if rate is None:
        logger.warning("No rate for %s, falling back to USD", target_currency)
        return {
            "amount": round(amount_usd, 2),
            "currency": "USD",
            "rate": 1.0,
            "formatted": f"${amount_usd:.2f}",
        }

    converted = amount_usd * rate
    formatted = _format_currency(converted, target_currency)
    return {
        "amount": round(converted, 2),
        "currency": target_currency,
        "rate": round(rate, 4),
        "formatted": formatted,
    }


def _format_currency(amount: float, currency: str) -> str:
    """Format a currency amount with the correct symbol and precision."""
    symbols = {
        "USD": "$",
        "GBP": "\u00a3",
        "EUR": "\u20ac",
        "NGN": "\u20a6",
        "ZAR": "R",
        "KES": "KSh",
        "GHS": "GH\u20b5",
        "INR": "\u20b9",
        "BRL": "R$",
        "MXN": "MX$",
        "JPY": "\u00a5",
        "CNY": "\u00a5",
        "KRW": "\u20a9",
        "AUD": "A$",
        "CAD": "C$",
        "SGD": "S$",
        "AED": "AED",
        "SAR": "SAR",
        "TRY": "\u20ba",
        "RUB": "\u20bd",
        "PLN": "z\u0142",
        "SEK": "kr",
        "NOK": "kr",
        "DKK": "kr",
        "CHF": "CHF",
        "THB": "\u0e3f",
        "PHP": "\u20b1",
        "IDR": "Rp",
        "MYR": "RM",
        "VND": "\u20ab",
        "EGP": "E\u00a3",
        "PKR": "Rs",
        "BDT": "\u09f3",
        "UAH": "\u20b4",
        "ARS": "AR$",
        "CLP": "CL$",
        "COP": "COL$",
        "PEN": "S/.",
        "NZD": "NZ$",
    }

    symbol = symbols.get(currency, currency + " ")

    # No decimal places for zero-decimal currencies
    zero_decimal = {"JPY", "KRW", "VND", "CLP", "UGX", "RWF"}
    if currency in zero_decimal:
        return f"{symbol}{amount:,.0f}"

    return f"{symbol}{amount:,.2f}"


async def detect_region(ip_address: str | None = None) -> dict[str, Any]:
    """Detect user region via IP geolocation.

    Returns dict with country_code, currency, and country_name.
    Falls back to US if detection fails.
    """
    if ip_address in (None, "127.0.0.1", "::1", "localhost"):
        # Local/loopback — can't geolocate
        return {
            "country_code": "US",
            "currency": "USD",
            "country_name": "United States",
        }

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            # Use ip-api.com free tier (45 req/min)
            resp = await client.get(f"http://ip-api.com/json/{ip_address}")
            if resp.status_code == 200:
                data = resp.json()
                country_code = data.get("countryCode", "US")
                currency = REGION_CURRENCY.get(country_code, "USD")
                country_name = REGION_NAMES.get(country_code, data.get("country", "Unknown"))
                return {
                    "country_code": country_code,
                    "currency": currency,
                    "country_name": country_name,
                }
    except Exception as e:
        logger.debug("Region detection failed: %s", e)

    return {
        "country_code": "US",
        "currency": "USD",
        "country_name": "United States",
    }
