export default ({ config }) => {
  const isDev = process.env.APP_ENV === "development";

  return {
    ...config,
    name: isDev ? "Hubble Dev" : "Hubble",
    slug: "hubble",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    keyboardAppearance: "automatic",
    newArchEnabled: false,
    scheme: "hubble",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    notification: {
      icon: "./assets/icon.png",
      color: "#3498db",
      androidMode: "default",
      androidCollapsedTitle: "Hubble",
    },
    ios: {
      supportsTablet: false,
      deploymentTarget: "15.1",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false,
      },
      bundleIdentifier: isDev
        ? "com.abcdefg123456710.hubble.dev"
        : "com.abcdefg123456710.hubble",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.WAKE_LOCK",
        "android.permission.POST_NOTIFICATIONS",
      ],
      package: isDev
        ? "com.abcdefg123456710.hubble.dev"
        : "com.abcdefg123456710.hubble",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#3498db",
          defaultChannel: "default",
        },
      ],
      "expo-dev-client",
      "expo-updates",
    ],
    extra: {
      eas: {
        projectId: "3a800a94-2beb-4074-b4bc-dbd3aca9faf5",
      },
    },
    owner: "abcdefg123456710",
    runtimeVersion: "1.0.0",
    updates: {
      url: "https://u.expo.dev/3a800a94-2beb-4074-b4bc-dbd3aca9faf5",
      fallbackToCacheTimeout: 0,
    },
  };
};
