import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately

// Wrap in try-catch to handle native module initialization errors gracefully
try {
  registerRootComponent(App);
} catch (error) {
  // Fallback: register directly if registerRootComponent fails
  console.error('Error registering root component:', error);
  AppRegistry.registerComponent('main', () => App);
}
