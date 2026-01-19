# Android AAB Build - Potential Issues Checklist

This document outlines all potential issues that could prevent your AAB from building successfully in Android Studio.

## ✅ **CRITICAL ISSUES** (Will definitely prevent build)

### 1. **Missing Release Keystore Configuration** ⚠️ HIGH PRIORITY
- **Issue**: No `keystore.properties` file in `android/` directory
- **Current Status**: ⚠️ You have `keystore.properties.example` but need the actual file
- **Fix Required**: 
  - Create `android/keystore.properties` with your signing credentials:
    ```
    MYAPP_RELEASE_STORE_FILE=release.keystore
    MYAPP_RELEASE_KEY_ALIAS=your-key-alias
    MYAPP_RELEASE_STORE_PASSWORD=your-store-password
    MYAPP_RELEASE_KEY_PASSWORD=your-key-password
    ```
  - Create release keystore file (or use existing) at `android/app/release.keystore`
- **Fallback**: Build will use debug keystore (NOT for production!)

### 2. **Missing Android SDK/Build Tools**
- **Issue**: Required Android SDK versions not installed
- **Check**: Android Studio → SDK Manager
- **Required**: 
  - Android SDK Platform 34+ (or whatever `compileSdkVersion` is set to)
  - Android SDK Build-Tools latest
  - NDK (version specified in build config)

### 3. **Gradle/Android Studio Version Mismatch**
- **Current Gradle**: 8.14.3
- **Issue**: Android Studio version incompatible with Gradle 8.14.3
- **Required**: Android Studio Hedgehog (2023.1.1) or later for Gradle 8.x
- **Fix**: Update Android Studio or downgrade Gradle in `gradle-wrapper.properties`

### 4. **Missing Node.js/Dependencies**
- **Issue**: Node modules not installed or outdated
- **Fix**: Run `npm install` or `yarn install` in project root

## ⚠️ **LIKELY ISSUES** (Common build failures)

### 5. **R8/ProGuard Minification Errors**
- **Current Status**: ✅ ProGuard rules added for Firebase
- **Potential Issue**: Missing ProGuard rules for other libraries
- **Symptom**: Build succeeds but app crashes on startup
- **Fix**: Add more `-keep` rules if needed for other dependencies

### 6. **Resource Shrinking Conflicts**
- **Current Status**: Enabled in `gradle.properties`
- **Issue**: Resource shrinking removing required resources
- **Symptom**: Build succeeds but runtime errors for missing resources
- **Fix**: Disable temporarily: `android.enableShrinkResourcesInReleaseBuilds=false`

### 7. **Dependency Version Conflicts**
- **Potential Conflicts**:
  - Firebase BOM 33.7.0 vs React Native Firebase 23.8.3
  - React Native versions
  - Expo SDK versions
- **Check**: Review build log for "conflict" or "duplicate" warnings
- **Fix**: Update conflicting dependencies

### 8. **Missing/Invalid google-services.json**
- **Current Status**: ✅ File exists at `android/app/google-services.json`
- **Check**: Verify package name matches: `com.abcdefg123456710.hubble`
- **Issue**: Wrong package name or corrupted file
- **Fix**: Re-download from Firebase Console

### 9. **Kotlin Version Compatibility**
- **Issue**: Kotlin version incompatible with Gradle/Android Gradle Plugin
- **Check**: Android Studio → Project Structure → Kotlin version
- **Required**: Kotlin 1.9+ for Gradle 8.x

### 10. **Java/JDK Version**
- **Issue**: Wrong JDK version
- **Required**: JDK 17 or JDK 11 (check Android Gradle Plugin requirements)
- **Check**: Android Studio → File → Project Structure → SDK Location → JDK location
- **Fix**: Install correct JDK and configure Android Studio

## 🔍 **POTENTIAL ISSUES** (Less common but possible)

### 11. **Memory Issues**
- **Current Setting**: `-Xmx2048m -XX:MaxMetaspaceSize=512m`
- **Issue**: Out of memory during build
- **Symptom**: Build fails with "OutOfMemoryError"
- **Fix**: Increase in `gradle.properties`:
  ```
  org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
  ```

### 12. **Native Library Conflicts**
- **Issue**: Multiple native libraries for same architecture
- **Symptom**: "duplicate entry" errors
- **Fix**: Check `packagingOptions` in `build.gradle`

### 13. **Manifest Merge Conflicts**
- **Issue**: Conflicts between app manifest and library manifests
- **Check**: Review merged manifest in build output
- **Fix**: Add merge rules in AndroidManifest.xml

### 14. **Expo Configuration Issues**
- **Issue**: Expo prebuild not run or outdated
- **Fix**: Run `npx expo prebuild --platform android --clean`

### 15. **Missing Resources**
- **Check**: All notification icons present (✅ verified)
- **Check**: Colors defined (✅ verified)
- **Issue**: Missing drawable resources referenced in code
- **Fix**: Ensure all referenced resources exist

### 16. **Build Variant Issues**
- **Issue**: Building wrong variant (debug instead of release)
- **Fix**: In Android Studio → Build → Select Build Variant → `release`

### 17. **Caching Issues**
- **Issue**: Corrupted Gradle cache
- **Fix**: 
  ```bash
  cd android
  ./gradlew clean
  ./gradlew cleanBuildCache
  ```
  Or delete `.gradle` folder in `android/`

### 18. **Network/Repository Access**
- **Issue**: Cannot download dependencies
- **Check**: Internet connection, proxy settings
- **Fix**: Check repositories in `build.gradle` are accessible

### 19. **File Path Issues (Windows/Mac)**
- **Issue**: Path length limits (especially on Windows)
- **Symptom**: "File name too long" errors
- **Fix**: Move project closer to root directory

### 20. **Signing Configuration Issues**
- **Issue**: Keystore file path incorrect or inaccessible
- **Fix**: Use absolute paths or verify relative path from `android/app/`
- **Check**: Keystore file exists and has correct permissions

## 📋 **PRE-BUILD CHECKLIST**

Before building in Android Studio:

- [ ] Run `npm install` or `yarn install`
- [ ] Run `npx expo prebuild --platform android --clean`
- [ ] Create `keystore.properties` with release signing config (OR accept debug keystore)
- [ ] Verify `google-services.json` package name matches app
- [ ] Update Android Studio to latest version
- [ ] Install required Android SDK platforms/tools
- [ ] Configure JDK version (17 recommended)
- [ ] Clean project: `./gradlew clean`
- [ ] Sync Gradle files in Android Studio

## 🚀 **BUILD COMMANDS**

### In Android Studio:
1. Build → Generate Signed Bundle / APK
2. Select "Android App Bundle"
3. Choose your keystore or create new
4. Select "release" variant
5. Build

### Via Command Line:
```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## 📝 **NOTES**

- **Current Setup**: Build will work with debug keystore if `keystore.properties` missing
- **Production**: MUST use proper release keystore for Play Store
- **Firebase**: ✅ All Firebase configuration verified and fixed
- **Minification**: Enabled - ProGuard rules added for Firebase
- **Resources**: All required resources present

## 🆘 **IF BUILD STILL FAILS**

1. Check build log for specific error message
2. Look for first error (often cascades from single issue)
3. Common patterns:
   - "Failed to resolve" → Dependency issue
   - "Duplicate class" → Version conflict
   - "Cannot find symbol" → Missing import or wrong package
   - "OutOfMemoryError" → Increase memory
   - "Execution failed" → Check task that failed
