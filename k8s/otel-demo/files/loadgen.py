#!/usr/bin/env python3
"""Steady synthetic traffic for the AKS shop demo, using only the standard library.

Each request carries W3C baggage demo.run_id, rotated on a schedule, so a
time-bounded batch of traces and logs can be found in KQL.
"""

import os
import random
import signal
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


def read_settings(environ):
    """Validate and return (target, requests_per_second, checkout_ratio, rotation_seconds)."""
    target = environ.get("TARGET_URL", "http://gateway:8080").rstrip("/")
    parsed = urllib.parse.urlsplit(target)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username
            or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError("TARGET_URL must be an HTTP(S) origin without a path, query, or credentials")
    rate = float(environ.get("REQUESTS_PER_SECOND", "1"))
    if not 0.1 <= rate <= 10:
        raise ValueError("REQUESTS_PER_SECOND must be between 0.1 and 10")
    ratio = float(environ.get("CHECKOUT_RATIO", "0.5"))
    if not 0 <= ratio <= 1:
        raise ValueError("CHECKOUT_RATIO must be between 0 and 1")
    rotation = int(environ.get("RUN_ID_ROTATION_SECONDS", "3600"))
    if not 60 <= rotation <= 86400:
        raise ValueError("RUN_ID_ROTATION_SECONDS must be between 60 and 86400")
    return target, rate, ratio, rotation


def send(target, scenario, run_id):
    request = urllib.request.Request(f"{target}/{scenario}", headers={"baggage": f"demo.run_id={run_id}"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return False


def main():
    try:
        target, rate, ratio, rotation = read_settings(os.environ)
    except ValueError as error:
        print(f"Invalid settings: {error}", file=sys.stderr)
        return 2
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    rng = random.Random()
    run_id, rotated_at = str(uuid.uuid4()), time.monotonic()
    sent = failed = 0
    reported_at = next_at = time.monotonic()
    print(f"Sending {rate:g} request(s)/s to {target}; run ID {run_id}", flush=True)
    while not stop.is_set():
        now = time.monotonic()
        if now - rotated_at >= rotation:
            run_id, rotated_at = str(uuid.uuid4()), now
            print(f"New run ID {run_id}", flush=True)
        scenario = "checkout" if rng.random() < ratio else "browse"
        sent += 1
        failed += not send(target, scenario, run_id)
        if now - reported_at >= 60:
            print(f"Sent {sent} requests, {failed} failed; run ID {run_id}", flush=True)
            sent = failed = 0
            reported_at = now
        # Pace to the target rate without bursting to catch up after slow requests.
        next_at = max(next_at + 1 / rate, time.monotonic())
        stop.wait(next_at - time.monotonic())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
