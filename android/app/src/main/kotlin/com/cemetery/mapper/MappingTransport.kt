package com.cemetery.mapper

import android.media.Image
import android.os.Handler
import android.os.Looper
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.util.ArrayDeque
import java.util.concurrent.TimeUnit

data class MappingFrame(
    val frameId: Long,
    val timestampNs: Long,
    val pose: FloatArray,
    val intrinsics: FloatArray,
    val width: Int,
    val height: Int,
    val payload: ByteArray,
)

class MappingTransport(
    private val endpoint: String = "ws://100.127.139.79:8080/ws/v1/mapping",
    private val onState: (String) -> Unit = {},
) {
    private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private val queue = ArrayDeque<ByteString>(MAX_QUEUE)
    private var socket: WebSocket? = null
    private var sessionId = ""
    private var connecting = false
    private var stopped = false

    @Synchronized
    fun start() {
        stopped = false
        if (sessionId.isEmpty()) sessionId = java.util.UUID.randomUUID().toString()
        connect()
    }

    @Synchronized
    fun enqueue(frame: MappingFrame) {
        val packet = encode(frame)
        if (socket?.send(packet) == true) return
        if (queue.size == MAX_QUEUE) queue.removeFirst()
        queue.addLast(packet)
        onState("QUEUED ${queue.size}/$MAX_QUEUE")
    }

    @Synchronized
    fun stop() {
        stopped = true
        reconnectHandler.removeCallbacksAndMessages(null)
        queue.clear()
        socket?.close(1000, "mapping stopped")
        socket = null
        client.dispatcher.executorService.shutdown()
    }

    private fun connect() {
        if (stopped || connecting || socket != null || endpoint.toHttpUrlOrNull() == null) return
        connecting = true
        onState("CONNECTING")
        val request = Request.Builder().url(endpoint).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                synchronized(this@MappingTransport) {
                    connecting = false
                    onState("CONNECTED")
                    flush()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                onState("ACK $text")
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                disconnected()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                onState("DISCONNECTED ${t.javaClass.simpleName}")
                disconnected()
            }
        })
    }

    private fun disconnected() {
        synchronized(this) {
            socket = null
            connecting = false
            if (!stopped) reconnectHandler.postDelayed({ connect() }, RECONNECT_MS)
        }
    }

    private fun flush() {
        while (queue.isNotEmpty()) {
            val packet = queue.removeFirst()
            if (socket?.send(packet) != true) {
                queue.addFirst(packet)
                return
            }
        }
    }

    private fun encode(frame: MappingFrame): ByteString {
        val header = JSONObject()
            .put("protocol", "cemetery.mapping.v1")
            .put("sessionId", sessionId)
            .put("frameId", frame.frameId)
            .put("timestampNs", frame.timestampNs)
            .put("format", "yuv420_888")
            .put("width", frame.width)
            .put("height", frame.height)
            .put("pose", JSONObject().put("position", JSONObject().put("x", frame.pose[0]).put("y", frame.pose[1]).put("z", frame.pose[2])).put("quaternion", listOf(frame.pose[3], frame.pose[4], frame.pose[5], frame.pose[6])))
            .put("intrinsics", JSONObject().put("fx", frame.intrinsics[0]).put("fy", frame.intrinsics[1]).put("cx", frame.intrinsics[2]).put("cy", frame.intrinsics[3]))
        val headerBytes = header.toString().toByteArray(Charsets.UTF_8)
        return ByteString.of(*ByteBuffer.allocate(4 + headerBytes.size + frame.payload.size).putInt(headerBytes.size).put(headerBytes).put(frame.payload).array())
    }

    companion object {
        private const val MAX_QUEUE = 3
        private const val RECONNECT_MS = 1000L
    }
}

object CameraFrameEncoder {
    fun encode(image: Image): ByteArray {
        val sizes = image.planes.map { it.buffer.remaining() }
        val total = 12 + sizes.sum() + (4 * sizes.size)
        val output = ByteBuffer.allocate(total).putInt(image.width).putInt(image.height).putInt(image.planes.size)
        image.planes.forEach { plane ->
            val bytes = ByteArray(plane.buffer.remaining())
            plane.buffer.duplicate().get(bytes)
            output.putInt(bytes.size)
            output.put(bytes)
        }
        return output.array()
    }
}
