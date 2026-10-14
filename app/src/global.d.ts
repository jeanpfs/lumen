export {};

declare global {
  interface Window {
    /** Present only inside the Android shell (see MainActivity.kt). */
    LumenNative?: {
      bluetoothEnabled(): boolean;
      enableBluetooth(): void;
    };
  }
}
