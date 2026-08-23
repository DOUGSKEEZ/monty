#!/usr/bin/env python3
"""
Govee H5100 IDENTIFY tool — bind a radio ID to a room by proximity.

Place ONE sensor right next to the Monty PC / Bluetooth dongle, then run
this. It scans briefly and ranks all heard sensors by signal strength; the
one sitting on the dongle will dominate (typically -30..-45 dBm vs -60..-95
for the rest). That radio ID is the room you just placed.

Usage:  govee/.venv/bin/python govee/identify.py [seconds]
"""
import asyncio
import sys
from collections import defaultdict
from bleak import BleakScanner

GOVEE_COMPANY_ID = 0x0001
readings = defaultdict(list)   # name -> list of rssi
latest = {}                    # name -> (temp_f, humidity, battery)


def decode(mfg):
    if len(mfg) < 6:
        return None
    packed = int.from_bytes(mfg[2:5], "big")
    neg = bool(packed & 0x800000)
    packed &= 0x7FFFFF
    temp_c = (packed / 10000.0) * (-1 if neg else 1)
    return round(temp_c * 9 / 5 + 32, 1), round((packed % 1000) / 10.0, 1), mfg[5]


def cb(device, adv):
    name = adv.local_name or ""
    if not name.startswith("GVH5100"):
        return
    mfg = adv.manufacturer_data.get(GOVEE_COMPANY_ID)
    if mfg is None:
        return
    readings[name].append(adv.rssi)
    d = decode(mfg)
    if d:
        latest[name] = d


async def main(duration):
    print(f"Identify scan for {duration}s — put ONE sensor on the dongle now...\n")
    scanner = BleakScanner(detection_callback=cb, scanning_mode="active")
    await scanner.start()
    await asyncio.sleep(duration)
    await scanner.stop()

    if not readings:
        print("Heard nothing. Scan longer or check the sensor has batteries in.")
        return

    # Rank by peak RSSI (closest sensor has the strongest single hit).
    ranked = sorted(readings.items(), key=lambda kv: max(kv[1]), reverse=True)
    print(f"{'':2}{'Name':<16}{'peak':>7}{'avg':>7}{'hits':>6}   {'Temp':>7}{'Humid':>7}{'Batt':>6}")
    print("-" * 64)
    for i, (name, rssis) in enumerate(ranked):
        peak = max(rssis)
        avg = round(sum(rssis) / len(rssis))
        t, h, b = latest.get(name, ("?", "?", "?"))
        flag = " <== CLOSEST (this room)" if i == 0 else ""
        tf = f"{t}F" if t != "?" else "?"
        hf = f"{h}%" if h != "?" else "?"
        bf = f"{b}%" if b != "?" else "?"
        print(f"{i+1:<2}{name:<16}{peak:>6}{avg:>7}{len(rssis):>6}   {tf:>7}{hf:>7}{bf:>6}{flag}")

    top, top_rssis = ranked[0]
    margin = (max(top_rssis) - max(ranked[1][1])) if len(ranked) > 1 else 99
    print(f"\nWinner: {top}  (peak {max(top_rssis)} dBm, {margin} dBm ahead of next)")
    if margin < 12:
        print("⚠  Margin is small — move the sensor closer to the dongle and rerun to be sure.")


if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 12))
