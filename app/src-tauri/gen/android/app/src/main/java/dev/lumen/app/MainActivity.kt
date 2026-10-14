package dev.lumen.app

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The app is dark by default: light status and navigation bar icons over its own background.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    // Edge-to-edge stops the system from resizing the window for the keyboard, so a sheet with a text field
    // ended up under it. Lift the content by the keyboard's height instead.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      view.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      insets
    }
    requestBluetoothPermissions()
  }

  /** The page asks Bluetooth's state and asks to switch it on through `window.LumenNative`. */
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(LumenNative(), "LumenNative")
  }

  private inner class LumenNative {
    /** `true` also when the device has no Bluetooth adapter: there is nothing to wait for then. */
    @JavascriptInterface
    fun bluetoothEnabled(): Boolean =
      (getSystemService(BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter?.isEnabled ?: true

    @JavascriptInterface
    fun enableBluetooth() {
      runOnUiThread {
        // without BLUETOOTH_CONNECT the enable request throws on Android 12+
        if (hasBluetoothPermissions()) askToEnableBluetooth() else requestBluetoothPermissions()
      }
    }
  }

  /** Scanning and connecting fail with a permission error until the user allows these. */
  private fun requestBluetoothPermissions() {
    val needed =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
      } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
      }
    val missing =
      needed.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQUEST_PERMISSIONS)
  }

  /** Every time the app comes to the foreground: the user may have switched Bluetooth off meanwhile. */
  override fun onStart() {
    super.onStart()
    if (hasBluetoothPermissions()) askToEnableBluetooth()
  }

  private fun hasBluetoothPermissions(): Boolean =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    })
      .all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_PERMISSIONS && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
      askToEnableBluetooth()
    }
  }

  /** With Bluetooth off the system refuses every scan without telling the app, so ask the user to switch it on. */
  private fun askToEnableBluetooth() {
    val adapter = (getSystemService(BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter ?: return
    if (adapter.isEnabled) return
    // BLUETOOTH_CONNECT is required on Android 12+; the callers above only get here once it is granted.
    startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
  }

  private companion object {
    const val REQUEST_PERMISSIONS = 1
  }
}
