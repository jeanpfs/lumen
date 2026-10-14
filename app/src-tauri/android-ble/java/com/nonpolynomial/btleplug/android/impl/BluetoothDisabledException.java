package com.nonpolynomial.btleplug.android.impl;

/** Added by Lumen: the adapter exists but Bluetooth is switched off, so scans would silently find nothing. */
class BluetoothDisabledException extends BluetoothException {
}
