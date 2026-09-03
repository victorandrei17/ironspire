import type { CapacitorConfig } from '@capacitor/cli';

/** SPEC §17.2. */
const config: CapacitorConfig = {
  appId: 'com.ironspire.game',
  appName: 'Iron Spire',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0d12',
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0d12',
  },
  plugins: {
    SplashScreen: {
      // Hidden by the game once it has drawn its first frame, so the player
      // never sees a gap between splash and game.
      launchAutoHide: false,
      backgroundColor: '#0b0d12',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
