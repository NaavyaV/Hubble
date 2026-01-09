# Android Build Guide for Hubble

This guide covers how to build your app for testing and production release on Android.

## Prerequisites

- Android Studio installed
- Java JDK installed
- Android SDK configured

---

## 📱 Option 1: Build TEST APK (For Your Friend)

A test APK is perfect for sharing with friends to test the app before submitting to Play Store.

### Steps in Android Studio:

1. **Open the Android folder in Android Studio**
   - File → Open → Navigate to `/Users/naavya/ReactProjects/Hubble/android`

2. **Wait for Gradle sync to complete** (bottom status bar)

3. **Build the Debug APK:**
   - Menu: Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Or use the command line:
     ```bash
     cd /Users/naavya/ReactProjects/Hubble/android
     ./gradlew assembleDebug
     ```

4. **Find your APK:**
   - Location: `android/app/build/outputs/apk/debug/app-debug.apk`
   - Click "locate" in the popup notification, or navigate manually

5. **Share the APK:**
   - Send `app-debug.apk` to your friend via email, AirDrop, Google Drive, etc.
   - They can install it by enabling "Install from Unknown Sources" on their Android device

### ⚠️ Note for Debug APK:
- This is NOT signed with your production key
- Can only be used for testing
- Cannot be uploaded to Play Store
- Will show "Debug" in the app name if configured

---

## 🚀 Option 2: Build PRODUCTION AAB (For Play Store)

The Android App Bundle (AAB) is required for Play Store submission.

### One-Time Setup:

#### Step 1: Generate Production Keystore

Open Terminal and run:

```bash
cd /Users/naavya/ReactProjects/Hubble/android/app
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore \
  -alias hubble-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**You'll be asked for:**
- Keystore password (choose a strong password)
- Key password (can be the same as keystore password)
- Your name
- Organization name
- City, State, Country

**⚠️ CRITICAL: Write down your passwords! You cannot recover them.**

#### Step 2: Create keystore.properties File

1. Copy the example file:
   ```bash
   cd /Users/naavya/ReactProjects/Hubble/android
   cp keystore.properties.example keystore.properties
   ```

2. Edit `keystore.properties` with your actual passwords:
   ```properties
   MYAPP_RELEASE_STORE_FILE=app/release.keystore
   MYAPP_RELEASE_KEY_ALIAS=hubble-key
   MYAPP_RELEASE_STORE_PASSWORD=your-actual-password
   MYAPP_RELEASE_KEY_PASSWORD=your-actual-password
   ```

3. **NEVER commit this file to git** (already in .gitignore)

### Build Production AAB:

#### In Android Studio:

1. **Make sure you've completed the one-time setup above**

2. **Select Build Variant:**
   - View → Tool Windows → Build Variants
   - Change "Active Build Variant" from `debug` to `release`

3. **Build the Bundle:**
   - Menu: Build → Build Bundle(s) / APK(s) → Build Bundle(s)
   - Or use the command line:
     ```bash
     cd /Users/naavya/ReactProjects/Hubble/android
     ./gradlew bundleRelease
     ```

4. **Find your AAB:**
   - Location: `android/app/build/outputs/bundle/release/app-release.aab`
   - This is the file you upload to Play Store!

#### Or via Command Line:

```bash
cd /Users/naavya/ReactProjects/Hubble/android
./gradlew bundleRelease
```

---

## 🔄 For Each New Release:

Before building a new version:

1. **Update Version Code** in `android/app/build.gradle`:
   ```gradle
   versionCode 2  // Increment by 1 each time (1 → 2 → 3...)
   versionName "1.0.1"  // Update as needed
   ```

2. **Rebuild the bundle** using the steps above

---

## 📦 File Sizes Reference:

- **Debug APK**: ~50-80 MB (larger, includes debug symbols)
- **Release APK**: ~30-50 MB (optimized)
- **Release AAB**: ~25-40 MB (further optimized by Play Store)

---

## 🐛 Troubleshooting:

### "Keystore not found" error:
- Make sure `keystore.properties` exists in the `android` folder
- Verify the path to your keystore is correct (should be `app/release.keystore`)

### "Failed to load keystore" error:
- Check your passwords in `keystore.properties`
- Make sure there are no extra spaces or quotes

### Gradle sync fails:
- File → Invalidate Caches → Restart
- Delete `android/.gradle` folder and try again

### Build is slow:
- First build takes 5-10 minutes (downloads dependencies)
- Subsequent builds are faster (1-3 minutes)

---

## ✅ What's Already Configured:

✅ Release signing configuration (auto-uses keystore.properties)  
✅ ProGuard/R8 code optimization enabled  
✅ Resource shrinking enabled  
✅ Android 13+ notification permissions  
✅ Debug keystore for testing (no setup needed)  
✅ Security: keystore files excluded from git  

---

## 🔒 Security Reminders:

- ⛔ **NEVER** commit `release.keystore` to git
- ⛔ **NEVER** commit `keystore.properties` to git
- ⛔ **NEVER** share your keystore passwords publicly
- ✅ **DO** back up your keystore and passwords securely
- ✅ **DO** use the same keystore for all future updates

If you lose your keystore, you cannot update your app on Play Store and must create a new listing!

---

## 📤 Uploading to Play Store:

1. Go to https://play.google.com/console
2. Select your app (or create new app)
3. Navigate to: Production → Create new release
4. Upload your `app-release.aab` file
5. Fill in release notes
6. Submit for review

Review typically takes 1-3 days.
