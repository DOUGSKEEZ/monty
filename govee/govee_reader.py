#!/usr/bin/env python3
"""
Govee H5100 BLE reader — Monty production service.

Passively/actively listens for the six H5100 thermo-hygrometer broadcasts,
decodes temperature/humidity/battery, maps each sensor (by MAC) to its room
via govee/sensors.json, and writes the latest reading per room to
data/govee_readings.json for the Express backend to serve.

No cloud, no API key, no pairing — it only listens to advertisements the
sensors already emit, so it does not disturb the Govee gateway/app.

Run:  govee/.venv/bin/python govee/govee_reader.py
Runs forever; intended to be managed by systemd (govee-reader.service).
"""
import asyncio
import json
import os
import re
import subprocess
import sys
from datetime import datetime

from bleak import BleakScanner

GOVEE_COMPANY_ID = 0x0001
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "sensors.json")
OUTPUT_PATH = os.path.join(HERE, "..", "data", "govee_readings.json")
WRITE_INTERVAL = 15          # seconds between file writes
SCAN_MODE = os.environ.get("GOVEE_SCAN_MODE", "active")  # "active" or "passive"
# Pin scanning to a specific radio BY MAC (hci numbers shuffle across reboots).
# Empty = use BlueZ default adapter.
ADAPTER_MAC = os.environ.get("GOVEE_ADAPTER_MAC", "").upper()

# room -> latest reading dict, kept in memory and flushed to disk periodically
latest = {}
# MAC(upper) -> sensor info incl. calibration offsets; reloaded each write cycle
MAC_MAP = {}
UNKNOWN = set()


def resolve_adapter():
    """Return the hciN name whose MAC matches ADAPTER_MAC, or None for default.

    We resolve at runtime so a reboot that renumbers hci0/hci1/hci2 still binds
    us to the correct physical radio (the onboard one dedicated to scanning),
    never the dongle carrying audio.
    """
    if not ADAPTER_MAC:
        return None
    # The BD address isn't in sysfs on this kernel, so parse `hciconfig`.
    try:
        out = subprocess.run(["hciconfig"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return None
    current = None
    for line in out.splitlines():
        m = re.match(r"^(hci\d+):", line)
        if m:
            current = m.group(1)
        elif "BD Address:" in line and current:
            mac = line.split("BD Address:")[1].split()[0].strip().upper()
            if mac == ADAPTER_MAC:
                return current
    return None


def load_mac_map():
    """Build {MAC(upper): {room, label, radio_id, temp_offset_f, humidity_offset}} from sensors.json.

    Offsets are our own calibration (the Govee app's calibration is cloud-side
    and never reaches the raw BLE broadcast we read). Both default to 0.
    """
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    mac_map = {}
    for radio_id, info in cfg.get("sensors", {}).items():
        mac = (info.get("mac") or "").upper()
        if mac:
            mac_map[mac] = {
                "room": info["room"],
                "label": info["label"],
                "radio_id": radio_id,
                "temp_offset_f": float(info.get("temp_offset_f", 0) or 0),
                "humidity_offset": float(info.get("humidity_offset", 0) or 0),
            }
    return mac_map


def decode(mfg):
    """H5100: bytes2..4 = packed temp/humidity, byte5 = battery. Returns dict or None."""
    if len(mfg) < 6:
        return None
    packed = int.from_bytes(mfg[2:5], "big")
    negative = bool(packed & 0x800000)
    packed &= 0x7FFFFF
    temp_c = (packed / 10000.0) * (-1 if negative else 1)
    humidity = (packed % 1000) / 10.0
    battery = mfg[5]
    # Sanity clamp: reject obviously corrupt packets rather than surfacing garbage.
    temp_f = temp_c * 9 / 5 + 32
    if not (-40 <= temp_f <= 160) or not (0 <= humidity <= 100):
        return None
    return {"temp_f": round(temp_f, 1), "humidity": round(humidity, 1), "battery": battery}


def make_callback():
    def cb(device, adv):
        mfg = adv.manufacturer_data.get(GOVEE_COMPANY_ID)
        if mfg is None:
            return
        mac = device.address.upper()
        info = MAC_MAP.get(mac)
        if info is None:
            name = adv.local_name or ""
            if name.startswith("GVH5100") and mac not in UNKNOWN:
                UNKNOWN.add(mac)
                print(f"[warn] Unmapped Govee sensor {name} ({mac}) — add it to sensors.json", flush=True)
            return
        reading = decode(mfg)
        if reading is None:
            return
        # Apply our per-sensor calibration offsets (raw broadcast is uncalibrated).
        if info["temp_offset_f"]:
            reading["temp_f"] = round(reading["temp_f"] + info["temp_offset_f"], 1)
        if info["humidity_offset"]:
            reading["humidity"] = round(min(100.0, max(0.0, reading["humidity"] + info["humidity_offset"])), 1)
        reading.update({
            "room": info["room"],
            "label": info["label"],
            "radio_id": info["radio_id"],
            "rssi": adv.rssi,
            "last_seen": datetime.now().isoformat(timespec="seconds"),
        })
        latest[info["room"]] = reading
    return cb


def write_output():
    """Atomically write the current readings to data/govee_readings.json."""
    payload = {
        "updated": datetime.now().isoformat(timespec="seconds"),
        "rooms": latest,
    }
    tmp = OUTPUT_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, OUTPUT_PATH)


async def writer_loop():
    global MAC_MAP
    while True:
        await asyncio.sleep(WRITE_INTERVAL)
        try:  # hot-reload mapping/calibration edits without a restart
            MAC_MAP = load_mac_map()
        except Exception as e:
            print(f"[error] config reload failed: {e}", flush=True)
        try:
            write_output()
        except Exception as e:  # never let a write error kill the scanner
            print(f"[error] write failed: {e}", flush=True)


async def main():
    global MAC_MAP
    MAC_MAP = load_mac_map()
    if not MAC_MAP:
        print("[fatal] no mapped sensors in sensors.json", flush=True)
        sys.exit(1)

    adapter = resolve_adapter()
    if ADAPTER_MAC and adapter is None:
        print(f"[warn] adapter {ADAPTER_MAC} not found; falling back to default adapter", flush=True)
    adapter_desc = f"{adapter} ({ADAPTER_MAC})" if adapter else "default adapter"
    print(f"Loaded {len(MAC_MAP)} sensors. Scanning ({SCAN_MODE} mode) on {adapter_desc}. "
          f"Writing {OUTPUT_PATH} every {WRITE_INTERVAL}s.", flush=True)

    scanner = BleakScanner(detection_callback=make_callback(),
                           scanning_mode=SCAN_MODE, adapter=adapter)
    await scanner.start()
    try:
        await writer_loop()
    finally:
        await scanner.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
