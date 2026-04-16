import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.secondmind.app',
  appName: 'SecondMind',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
