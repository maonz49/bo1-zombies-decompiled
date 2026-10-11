#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
runtime="$(xcrun simctl list runtimes available -j | python3 -c 'import json,sys; a=[r for r in json.load(sys.stdin)["runtimes"] if r["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-")]; print(sorted(a,key=lambda r:tuple(map(int,r["version"].split("."))))[-1]["identifier"])')"
device_type="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; print(next(d["identifier"] for d in json.load(sys.stdin)["devicetypes"] if d["name"] == "iPhone 16 Pro"))')"
device="$(xcrun simctl create BO1-Smoke "$device_type" "$runtime")"
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true; xcrun simctl delete "$device" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$project_dir/build/iphonesimulator/Payload/BO1Mobile.app"
xcrun simctl launch "$device" eu.znoam.bo1.mobile
# Allow the native launch screen to finish. This does not start or validate gameplay.
sleep 5
xcrun simctl io "$device" screenshot "$project_dir/build/launcher-simulator.png"
echo 'Native launcher installed and launched. BO1 gameplay was not tested.'
