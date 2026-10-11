#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
sdk="${1:-iphoneos}"
case "$sdk" in
  iphoneos) target="arm64-apple-ios18.0"; platform="iPhoneOS" ;;
  iphonesimulator) target="$(uname -m)-apple-ios18.0-simulator"; platform="iPhoneSimulator" ;;
  *) echo 'Expected iphoneos or iphonesimulator' >&2; exit 2 ;;
esac
output_dir="$project_dir/build/$sdk"
app_dir="$output_dir/Payload/BO1Mobile.app"
mkdir -p "$app_dir"
sdk_path="$(xcrun --sdk "$sdk" --show-sdk-path)"
xcrun --sdk "$sdk" clang \
  -target "$target" -isysroot "$sdk_path" \
  -fobjc-arc -fmodules -Os -Wall -Wextra -Wno-unused-parameter \
  -framework UIKit -framework WebKit -framework AVFoundation \
  "$project_dir/BO1Mobile/main.m" -o "$app_dir/BO1Mobile"
cp "$project_dir/BO1Mobile/Info.plist" "$app_dir/Info.plist"
cp "$project_dir/BO1Mobile/Diagnostics.js" "$app_dir/Diagnostics.js"
/usr/libexec/PlistBuddy -c 'Delete :CFBundleSupportedPlatforms' "$app_dir/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c 'Add :CFBundleSupportedPlatforms array' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleSupportedPlatforms:0 string $platform" "$app_dir/Info.plist"
python3 "$project_dir/scripts/icons.py" "$app_dir"
codesign --force --sign - --timestamp=none "$app_dir"
codesign --verify --strict "$app_dir"
if [[ "$sdk" == iphoneos ]]; then
  (cd "$output_dir" && COPYFILE_DISABLE=1 zip -qry -X BO1-Mobile.ipa Payload)
  python3 "$project_dir/scripts/verify_ipa.py" "$output_dir/BO1-Mobile.ipa"
fi
echo "$app_dir"
