package com.cemetery.mapper

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
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
    var permissionGranted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionGranted = granted
        if (granted) scanning = true
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF101615)) {
            if (scanning && permissionGranted) {
                CameraScreen(onStop = { scanning = false })
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("Cemetery Mapper", style = MaterialTheme.typography.headlineMedium, color = Color(0xFFF2F5ED))
                    Text("Android scanner", modifier = Modifier.padding(top = 8.dp), color = Color(0xFFA6B1AA))
                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }, modifier = Modifier.padding(top = 24.dp)) {
                        Text("Start Mapping")
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraScreen(onStop: () -> Unit) {
    var status by remember { mutableStateOf(ArCoreStatus()) }
    Box(modifier = Modifier.fillMaxSize()) {
        if (status.error?.startsWith("ARCORE_") == true) {
            CameraXPreview(modifier = Modifier.fillMaxSize())
        } else {
            ArCorePreview(status = { status = it }, modifier = Modifier.fillMaxSize())
        }
        Column(modifier = Modifier.align(Alignment.TopStart).padding(20.dp)) {
            Text("ARCore · ${status.tracking}", color = if (status.error == null) Color.White else Color(0xFFFFB4AB))
            Text("Pose: ${status.position}", color = Color.White)
            Text("Intrinsics: ${status.intrinsics}", color = Color.White)
            status.error?.let { Text(it, color = Color(0xFFFFB4AB)) }
        }
        Column(modifier = Modifier.align(Alignment.BottomCenter).padding(20.dp)) {
            Text("ARCore camera + real pose", color = Color.White, modifier = Modifier.padding(bottom = 10.dp))
            Button(onClick = onStop, modifier = Modifier.fillMaxWidth()) { Text("Stop Mapping") }
        }
    }
}

@Composable
private fun ArCorePreview(status: (ArCoreStatus) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            ArCoreCameraView(viewContext, context as ComponentActivity, status).also { view ->
                view.start()
            }
        },
    )
}

@Composable
private fun CameraXPreview(modifier: Modifier = Modifier) {
    val activity = LocalContext.current as ComponentActivity
    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            PreviewView(viewContext).also { previewView ->
                val providerFuture = ProcessCameraProvider.getInstance(viewContext)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    provider.unbindAll()
                    provider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, preview)
                }, ContextCompat.getMainExecutor(viewContext))
            }
        },
    )
}
