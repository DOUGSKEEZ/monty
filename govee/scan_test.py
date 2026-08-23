#!/usr/bin/env python3
"""
Govee H5100 BLE broadcast scanner — TEST / DIAGNOSTIC TOOL.

Passively listens for Govee GVH5100 sensor advertisements and decodes
temperature, humidity, and battery. Also prints RSSI (signal strength)
so we can judge range headroom per sensor (esp. the garage unit).

Nothing here pairs or connects — it only listens to broadcasts, so it
does not disturb the Govee gateway/app or the Bluetooth audio stream.

Usage:  govee/.venv/bin/python govee/scan_test.py [seconds]
"""
import asyncio
import sys
from bleak import BleakScanner

# Govee's BLE manufacturer "company ID" for the H5100 (verified via raw dump).
GOVEE_COMPANY_ID = 0x0001

seen = {}


def decode_h5100(mfg_bytes):
    """
    H5100 encoding (payload e.g. 01 01 03 d5 97 64):
      bytes0..1  = header/flag (0x01 0x01)
      bytes2..4  = 3-byte big-endian packed value
      byte5      = battery %
    Packed value holds temp*10000 + humidity*10 (humidity = value % 1000).
    High bit of the packed value indicates a negative temperature.
    Returns (temp_f, humidity_pct, battery_pct) or None.
    """
    if len(mfg_bytes) < 6:
        return None
    packed = int.from_bytes(mfg_bytes[2:5], "big")
    negative = bool(packed & 0x800000)
    packed &= 0x7FFFFF
    temp_c = (packed / 10000.0) * (-1 if negative else 1)
    humidity = (packed % 1000) / 10.0
    battery = mfg_bytes[5]
    temp_f = temp_c * 9 / 5 + 32
    return round(temp_f, 1), round(humidity, 1), battery


def callback(device, adv):
    mfg = adv.manufacturer_data.get(GOVEE_COMPANY_ID)
    name = adv.local_name or device.name or ""
    if not name.startswith("GVH5100"):
        return
    if mfg is None:
        return
    decoded = decode_h5100(mfg)
    if decoded is None:
        return
    temp_f, humidity, battery = decoded
    seen[device.address] = (name, temp_f, humidity, battery, adv.rssi)


async def main(duration):
    print(f"Passive-scanning {duration}s for Govee H5100 sensors...\n")
    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()
    await asyncio.sleep(duration)
    await scanner.stop()

    if not seen:
        print("No H5100 sensors decoded. Try moving the sensor closer or scanning longer.")
        return
    print(f"{'Name':<16} {'MAC':<18} {'Temp':>7} {'Humid':>7} {'Batt':>5} {'RSSI':>6}")
    print("-" * 64)
    for addr, (name, t, h, b, rssi) in sorted(seen.items(), key=lambda x: -x[1][4]):
        print(f"{name:<16} {addr:<18} {t:>6}F {h:>6}% {b:>4}% {rssi:>5}dBm")
    print("\nRSSI guide: > -70 excellent | -70..-85 good | -85..-95 marginal | < -95 unreliable")


if __name__ == "__main__":
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    asyncio.run(main(dur))
