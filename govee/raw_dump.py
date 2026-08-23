#!/usr/bin/env python3
"""Raw BLE advertisement dump for known Govee H5100 MACs — figure out the real payload format."""
import asyncio
from bleak import BleakScanner

KNOWN = {
    "D1:06:00:C6:44:6E", "D1:06:06:46:19:4E",
    "D4:0E:84:06:38:19", "D4:0E:84:C6:37:20",
}
dumped = {}


def cb(device, adv):
    addr = device.address.upper()
    if addr not in KNOWN and not (adv.local_name or "").startswith("GVH5100"):
        return
    mfg = {hex(k): v.hex() for k, v in adv.manufacturer_data.items()}
    svc = {k: v.hex() for k, v in adv.service_data.items()}
    key = (addr, str(mfg), str(svc))
    if key in dumped:
        return
    dumped[key] = True
    print(f"{addr}  name={adv.local_name!r}  rssi={adv.rssi}")
    if mfg:
        print(f"    manufacturer_data: {mfg}")
    if svc:
        print(f"    service_data: {svc}")


async def main():
    print("Dumping raw adv from Govee sensors for 30s (active scan)...\n")
    scanner = BleakScanner(detection_callback=cb, scanning_mode="active")
    await scanner.start()
    await asyncio.sleep(30)
    await scanner.stop()
    print("\nDone.")


asyncio.run(main())
