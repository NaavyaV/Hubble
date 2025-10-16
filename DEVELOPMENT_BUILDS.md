# Development Builds Guide

This project is now configured to use Expo Development Builds, which allows you to create custom native builds that work with your existing simulators and devices.

## What Changed

1. **iOS Deployment Target**: Set to 15.1 (compatible with your iOS 17.5 and 18.1 simulators)
2. **Development Client**: Added `expo-dev-client` plugin
3. **EAS Configuration**: Added `eas.json` with development build profiles
4. **Package Scripts**: Updated to use development client mode

## How to Use Development Builds

### 1. Build Development Client

First, you need to create a development build that will work with your simulators:

```bash
# For iOS (will work with iOS 15.1+ simulators)
npm run build:dev:ios

# For Android
npm run build:dev:android
```

### 2. Install Development Build

- **iOS**: The build will be available in your Apple Developer account and can be installed via Xcode or TestFlight
- **Android**: The build will be available as an APK or AAB file

### 3. Start Development Server

```bash
npm start
# or
npx expo start --dev-client
```

### 4. Connect to Development Build

- Open your development build app on your device/simulator
- Scan the QR code from the terminal or enter the URL manually
- Your app will load with hot reloading and debugging capabilities

## Benefits

- ✅ Works with iOS 15.1+ simulators (no need for iOS 18.5)
- ✅ Full native functionality
- ✅ Hot reloading and debugging
- ✅ Custom native modules support
- ✅ Faster iteration than regular Expo Go

## Next Steps

1. Run `npm run build:dev:ios` to create your first development build
2. Install the development build on your simulator
3. Use `npm start` to connect to your development server
4. Enjoy development with full native capabilities!

## Troubleshooting

- If you encounter issues, make sure you have the latest EAS CLI: `npm install -g eas-cli`
- Ensure your Apple Developer account is properly configured
- Check that your iOS deployment target matches your simulator version
