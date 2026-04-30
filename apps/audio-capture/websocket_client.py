import asyncio
import websockets
import json
import threading
from typing import Optional, Callable, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FLACWebSocketClient:
    """WebSocket client for FLAC audio streaming."""

    def __init__(self, server_url: str, room_code: str):
        self.server_url = server_url
        self.room_code = room_code
        self._websocket = None
        self._connected = False
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._future: Optional[asyncio.Future] = None

        self._on_connected: Optional[Callable] = None
        self._on_disconnected: Optional[Callable] = None
        self._on_error: Optional[Callable[[str], None]] = None
        self._on_listener_count: Optional[Callable[[int], None]] = None

    def set_connected_callback(self, callback: Callable):
        """Set callback for connection established."""
        self._on_connected = callback

    def set_disconnected_callback(self, callback: Callable):
        """Set callback for disconnection."""
        self._on_disconnected = callback

    def set_error_callback(self, callback: Callable[[str], None]):
        """Set callback for errors."""
        self._on_error = callback

    def set_listener_count_callback(self, callback: Callable[[int], None]):
        """Set callback for listener count updates."""
        self._on_listener_count = callback

    def connect(self) -> bool:
        """Connect to the WebSocket server."""
        try:
            self._thread = threading.Thread(target=self._run_async, daemon=True)
            self._thread.start()
            self._running = True
            return True
        except Exception as e:
            logger.error(f"Connection error: {e}")
            if self._on_error:
                self._on_error(str(e))
            return False

    def _run_async(self):
        """Run async WebSocket connection in a separate thread."""
        asyncio.run(self._async_connect())

    async def _async_connect(self):
        """Async connection logic."""
        try:
            async with websockets.connect(
                self.server_url,
                ping_interval=30,
                ping_timeout=10,
            ) as ws:
                self._websocket = ws
                self._connected = True
                logger.info(f"Connected to {self.server_url}")

                connect_msg = {
                    "type": "flac-host-connect",
                    "code": self.room_code,
                }
                await ws.send(json.dumps(connect_msg))

                if self._on_connected:
                    self._on_connected()

                async for message in ws:
                    await self._handle_message(message)

        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"Connection closed: {e}")
            self._connected = False
            if self._on_disconnected:
                self._on_disconnected()

        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            self._connected = False
            if self._on_error:
                self._on_error(str(e))
            if self._on_disconnected:
                self._on_disconnected()

    async def _handle_message(self, message):
        """Handle incoming WebSocket messages."""
        try:
            if isinstance(message, bytes):
                return

            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "flac-listener-count":
                count = data.get("count", 0)
                if self._on_listener_count:
                    self._on_listener_count(count)

            elif msg_type == "flac-room-ended":
                logger.info("Room ended by server")
                if self._on_disconnected:
                    self._on_disconnected()

            elif msg_type == "error":
                error_msg = data.get("error", "Unknown error")
                logger.error(f"Server error: {error_msg}")
                if self._on_error:
                    self._on_error(error_msg)

        except json.JSONDecodeError:
            logger.warning("Invalid JSON message received")

    def send_audio_data(self, audio_data: bytes) -> bool:
        """Send FLAC audio data to server."""
        if not self._connected or not self._websocket:
            return False

        try:
            asyncio.run(self._websocket.send(audio_data))
            return True
        except Exception as e:
            logger.error(f"Error sending audio data: {e}")
            return False

    def send_audio_data_async(self, audio_data: bytes) -> bool:
        """Send audio data asynchronously."""
        if not self._connected:
            return False

        def _send():
            try:
                if self._websocket:
                    asyncio.run(self._websocket.send(audio_data))
            except Exception as e:
                logger.error(f"Async send error: {e}")

        thread = threading.Thread(target=_send, daemon=True)
        thread.start()
        return True

    def disconnect(self):
        """Disconnect from the WebSocket server."""
        self._running = False

        if self._websocket:
            try:
                asyncio.run(self._websocket.close())
            except Exception:
                pass

        self._connected = False

    def is_connected(self) -> bool:
        """Check if connected to server."""
        return self._connected


class SimpleWebSocketClient:
    """Simplified synchronous WebSocket client using threading."""

    def __init__(self, server_url: str, room_code: str):
        self.server_url = server_url
        self.room_code = room_code
        self._connected = False
        self._ws = None

    def connect(self) -> bool:
        """Attempt to connect to server."""
        try:
            import websocket

            self._ws = websocket.WebSocket()
            self._ws.settimeout(5)
            self._ws.connect(self.server_url)

            connect_msg = json.dumps({
                "type": "flac-host-connect",
                "code": self.room_code,
            })
            self._ws.send(connect_msg)

            self._connected = True
            return True

        except Exception as e:
            print(f"Connection failed: {e}")
            self._connected = False
            return False

    def send_audio(self, audio_data: bytes) -> bool:
        """Send binary audio data."""
        if not self._connected or not self._ws:
            return False

        try:
            self._ws.send(audio_data, opcode=websocket.ABOP_FRAME_BINARY)
            return True
        except Exception as e:
            print(f"Send error: {e}")
            self._connected = False
            return False

    def is_connected(self) -> bool:
        """Check connection status."""
        return self._connected

    def disconnect(self):
        """Disconnect from server."""
        if self._ws:
            try:
                self._ws.close()
            except:
                pass
        self._connected = False