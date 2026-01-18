import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately

// Set up Firebase Cloud Messaging background handler for Android
if (Platform.OS === 'android') {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    
    // Register background message handler
    // This function must be defined before registerRootComponent
    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('Background FCM message:', remoteMessage);
      // Background messages are handled automatically by the OS
      // You can process the data here if needed
    });
  } catch (error) {
    // Firebase Messaging not available - background handler not registered
    if (__DEV__) {
      console.log('Firebase Messaging background handler not available:', error);
    }
  }
}

// Wrap in try-catch to handle native module initialization errors gracefully
try {
  registerRootComponent(App);
} catch (error) {
  // Fallback: register directly if registerRootComponent fails
  console.error('Error registering root component:', error);
  AppRegistry.registerComponent('main', () => App);
}
