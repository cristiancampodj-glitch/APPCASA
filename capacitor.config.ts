import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cristiancampo.casasaas',
  appName: 'Mi Casa',
  webDir: 'public',
  server: {
    // Cambia a tu URL de producción de Railway para que la app móvil llame al backend
    url: 'https://TU-APP.up.railway.app',
    cleartext: false,
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0ea5e9',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP'
    }
  }
};

export default config;
