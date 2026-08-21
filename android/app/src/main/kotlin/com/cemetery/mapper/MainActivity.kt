package com.cemetery.mapper

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.compose.ui.viewinterop.AndroidView
import com.google.ar.core.ArCoreApk
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CemeteryMapperApp() }
    }
}

@Composable
private fun CemeteryMapperApp() {
    val context = LocalContext.current
    var scanning by remember { mutableStateOf(false) }
    var permissionGranted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionGranted = granted
        if (granted) scanning = true
    }
    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = Color(0xFF101615)) {
            if (scanning && permissionGranted) CameraScreen { scanning = false }
            else Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("Cemetery Mapper", style = MaterialTheme.typography.headlineMedium, color = Color(0xFFF2F5ED))
                Text("Android scanner", modifier = Modifier.padding(top = 8.dp), color = Color(0xFFA6B1AA))
                Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }, modifier = Modifier.padding(top = 24.dp)) { Text("Start Mapping") }
            }
        }
    }
}

@Composable
private fun CameraScreen(onStop: () -> Unit) {
    val context = LocalContext.current
    var refresh by remember { mutableStateOf(0) }
    var availability by remember { mutableStateOf<ArCoreApk.Availability?>(null) }
    LaunchedEffect(refresh) {
        availability = null
        while (true) {
            val current = ArCoreApk.getInstance().checkAvailability(context)
            availability = current
            if (current != ArCoreApk.Availability.UNKNOWN_CHECKING && current != ArCoreApk.Availability.UNKNOWN_ERROR && current != ArCoreApk.Availability.UNKNOWN_TIMED_OUT) break
            delay(300)
        }
    }
    when (availability) {
        ArCoreApk.Availability.SUPPORTED_INSTALLED -> ArCoreSessionScreen(onStop)
        ArCoreApk.Availability.SUPPORTED_NOT_INSTALLED, ArCoreApk.Availability.SUPPORTED_APK_TOO_OLD -> ArCoreInstallScreen { refresh++ }
        ArCoreApk.Availability.UNSUPPORTED_DEVICE_NOT_CAPABLE -> ArCoreUnavailableScreen(onStop)
        else -> ArCoreCheckingScreen(onStop)
    }
}

@Composable
private fun ArCoreSessionScreen(onStop: () -> Unit) {
    var status by remember { mutableStateOf(ArCoreStatus()) }
    Box(Modifier.fillMaxSize()) {
        AndroidView(modifier = Modifier.fillMaxSize(), factory = { viewContext ->
            ArCoreCameraView(viewContext, { next -> status = next }).also { view -> view.start() }
        })
        Column(Modifier.align(Alignment.TopStart).padding(20.dp)) {
            Text("ARCore · ${status.tracking}", color = Color.White)
            Text("Pose: ${status.position}", color = Color.White)
            Text("Intrinsics: ${status.intrinsics}", color = Color.White)
            status.error?.let { Text(it, color = Color(0xFFFFB4AB)) }
        }
        Button(onClick = onStop, modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(20.dp)) { Text("Stop Mapping") }
    }
}

@Composable
private fun ArCoreCheckingScreen(onStop: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Checking ARCore…", color = Color.White)
        Button(onClick = onStop, modifier = Modifier.padding(top = 24.dp)) { Text("Cancel") }
    }
}

@Composable
private fun ArCoreInstallScreen(onRetry: () -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Google Play Services for AR is required", color = Color.White)
        Text("Install or update ARCore, then return and press Check again.", color = Color(0xFFA6B1AA), modifier = Modifier.padding(top = 12.dp))
        Button(onClick = {
            try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.ar.core"))) }
            catch (_: Exception) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.ar.core"))) }
        }, modifier = Modifier.padding(top = 24.dp)) { Text("Install ARCore") }
        Button(onClick = onRetry, modifier = Modifier.padding(top = 12.dp)) { Text("Check again") }
    }
}

@Composable
private fun ArCoreUnavailableScreen(onStop: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("ARCore is not supported on this device", color = Color(0xFFFFB4AB))
        Button(onClick = onStop, modifier = Modifier.padding(top = 24.dp)) { Text("Back") }
    }
}
