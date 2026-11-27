import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.halalcryptointelligence.app",
  appName: "Halal Crypto Intelligence",
  webDir: "mobile",
  server: {
    androidScheme: "https",
    cleartext: true,
    allowNavigation: ["*"],
  },
  android: {
    backgroundColor: "#060a13",
    allowMixedContent: true,
  },
};

export default config;
