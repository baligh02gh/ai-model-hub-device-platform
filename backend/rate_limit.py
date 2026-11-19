"""Small in-memory rate limiter for login attempts.

Keyed by (client IP, email) so a flood of guesses against one account from
one place gets locked out, without one bad actor being able to lock out a
legitimate user by failing their login from a different IP.

In-memory only: resets if the backend restarts, and does not share state
across multiple backend replicas. Fine for this project's single-instance
deployment; a shared store (e.g. Redis) would be needed to scale out.
"""

import time
from fastapi import HTTPException

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 5 * 60

_failures: dict[tuple[str, str], list[float]] = {}


def _prune(key: tuple[str, str]) -> list[float]:
    cutoff = time.time() - WINDOW_SECONDS
    attempts = [t for t in _failures.get(key, []) if t > cutoff]
    _failures[key] = attempts
    return attempts


def check(ip: str, email: str) -> None:
    key = (ip, email.lower())
    if len(_prune(key)) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in a few minutes.",
        )


def record_failure(ip: str, email: str) -> None:
    key = (ip, email.lower())
    _prune(key)
    _failures.setdefault(key, []).append(time.time())


def clear(ip: str, email: str) -> None:
    _failures.pop((ip, email.lower()), None)
