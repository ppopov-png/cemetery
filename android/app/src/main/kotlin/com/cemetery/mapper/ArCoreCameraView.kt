package com.cemetery.mapper

import android.content.Context
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

data class ArCoreStatus(
    val tracking: String = "INITIALIZING",
    val position: String = "—",
    val intrinsics: String = "—",
    val error: String? = null,
)

class ArCoreCameraView(
    context: Context,
    private val onStatus: (ArCoreStatus) -> Unit,
) : GLSurfaceView(context) {
    private val renderer = Renderer(context, onStatus, { requestRender() })

    init {
        setEGLContextClientVersion(2)
        setRenderer(renderer)
        renderMode = RENDERMODE_CONTINUOUSLY
        preserveEGLContextOnPause = true
    }

    fun start() { queueEvent { renderer.start() }; requestRender() }
    fun stop() { queueEvent { renderer.stop() } }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    private class Renderer(
        private val context: Context,
        private val onStatus: (ArCoreStatus) -> Unit,
        private val requestFrame: () -> Unit,
    ) : GLSurfaceView.Renderer {
        private var session: Session? = null
        private var cameraTextureId = 0
        private var program = 0
        private var running = false
        private var startRequested = false
        private val vertexBuffer: FloatBuffer = ByteBuffer.allocateDirect(VERTICES.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(VERTICES).position(0) }

        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            cameraTextureId = createExternalTexture()
            program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
            if (startRequested) startSession()
        }

        override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
            GLES20.glViewport(0, 0, width, height)
        }

        override fun onDrawFrame(gl: GL10?) {
            val current = session ?: return
            try {
                val frame = current.update()
                drawCamera()
                publish(frame)
            } catch (error: Exception) {
                onStatus(ArCoreStatus(error = "ARCORE_UPDATE_FAILED: ${error.message ?: error.javaClass.simpleName}"))
            }
        }

        fun start() {
            startRequested = true
            if (cameraTextureId == 0) return
            startSession()
        }

        private fun startSession() {
            try {
                val created = session ?: Session(context).also { session = it }
                val config = Config(created).apply {
                    updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                    focusMode = Config.FocusMode.AUTO
                }
                created.configure(config)
                created.setCameraTextureName(cameraTextureId)
                created.resume()
                running = true
                requestFrame()
            } catch (error: Exception) {
                onStatus(ArCoreStatus(error = "ARCORE_START_FAILED: ${error.message ?: error.javaClass.simpleName}"))
            }
        }

        fun stop() {
            startRequested = false
            running = false
            session?.pause()
            session?.close()
            session = null
        }

        private fun publish(frame: Frame) {
            if (!running) return
            val camera = frame.camera
            if (camera.trackingState != TrackingState.TRACKING) {
                onStatus(ArCoreStatus(tracking = camera.trackingState.name))
                return
            }
            val pose = camera.displayOrientedPose
            val translation = pose.translation
            val image = camera.imageIntrinsics
            val focal = image.focalLength
            val principal = image.principalPoint
            onStatus(
                ArCoreStatus(
                    tracking = "TRACKING",
                    position = "x %.2f  y %.2f  z %.2f m".format(translation[0], translation[1], translation[2]),
                    intrinsics = "f %.0f×%.0f  c %.0f×%.0f".format(focal[0], focal[1], principal[0], principal[1]),
                ),
            )
        }

        private fun drawCamera() {
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            GLES20.glUseProgram(program)
            val position = GLES20.glGetAttribLocation(program, "aPosition")
            val texCoord = GLES20.glGetAttribLocation(program, "aTexCoord")
            vertexBuffer.position(0)
            GLES20.glEnableVertexAttribArray(position)
            GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)
            vertexBuffer.position(2)
            GLES20.glEnableVertexAttribArray(texCoord)
            GLES20.glVertexAttribPointer(texCoord, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GLES20.glDisableVertexAttribArray(position)
            GLES20.glDisableVertexAttribArray(texCoord)
        }

        private fun createExternalTexture(): Int {
            val texture = IntArray(1)
            GLES20.glGenTextures(1, texture, 0)
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture[0])
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            return texture[0]
        }

        private fun createProgram(vertex: String, fragment: String): Int {
            fun compile(type: Int, source: String): Int {
                val shader = GLES20.glCreateShader(type)
                GLES20.glShaderSource(shader, source)
                GLES20.glCompileShader(shader)
                return shader
            }
            val result = GLES20.glCreateProgram()
            GLES20.glAttachShader(result, compile(GLES20.GL_VERTEX_SHADER, vertex))
            GLES20.glAttachShader(result, compile(GLES20.GL_FRAGMENT_SHADER, fragment))
            GLES20.glLinkProgram(result)
            return result
        }

        companion object {
            private val VERTICES = floatArrayOf(-1f, -1f, 0f, 1f, 1f, -1f, 1f, 1f, -1f, 1f, 0f, 0f, 1f, 1f, 1f, 0f)
            private const val VERTEX_SHADER = "attribute vec4 aPosition; attribute vec2 aTexCoord; varying vec2 vTexCoord; void main(){ gl_Position=aPosition; vTexCoord=aTexCoord; }"
            private const val FRAGMENT_SHADER = "#extension GL_OES_EGL_image_external : require\nprecision mediump float; uniform samplerExternalOES sTexture; varying vec2 vTexCoord; void main(){ gl_FragColor=texture2D(sTexture,vTexCoord); }"
        }
    }
}
