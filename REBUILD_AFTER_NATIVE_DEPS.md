# Rebuild native app after adding native modules (e.g. expo-image)

After adding **expo-image** (or any package with native code), the dev client must be rebuilt so the native module is linked. Metro alone is not enough.

## iOS

1. **Install CocoaPods dependencies** (picks up expo-image):
   ```bash
   cd ios && pod install && cd ..
   ```

2. **Rebuild and run the app** (compiles native code including ExpoImage):
   ```bash
   npx expo run:ios
   ```
   Or open `ios/Hubble.xcworkspace` in Xcode and run (⌘R).

3. **If you use a physical device**, ensure the device is selected:
   ```bash
   npx expo run:ios --device
   ```

## Android

1. **Rebuild and run** (Gradle will link native modules):
   ```bash
   npx expo run:android
   ```

2. **If you use a physical device**, connect it via USB with USB debugging enabled, or use an emulator.

## EAS / cloud builds

If you use EAS Build for development clients:

- **iOS**: `eas build --platform ios --profile development`
- **Android**: `eas build --platform android --profile development`

Install the new build on your device/simulator; then `npx expo start --dev-client` will load JS from Metro while the app uses the new native binary.

## One-liner (iOS, from project root)

```bash
cd ios && pod install && cd .. && npx expo run:ios
```

After the rebuild, the "Cannot find native module 'ExpoImage'" error should be resolved.
