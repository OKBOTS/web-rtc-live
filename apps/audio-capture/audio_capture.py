import threading
import queue
import numpy as np
from typing import Optional, Callable
import time
import subprocess
import os


class SystemAudioCapture:
    """Captures system audio using sounddevice with better device detection."""

    def __init__(
        self,
        sample_rate: int = 96000,
        channels: int = 2,
        buffer_size: int = 4096,
        device_index: Optional[int] = None,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.buffer_size = buffer_size
        self.device_index = device_index
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue = queue.Queue(maxsize=100)
        self._callback: Optional[Callable[[np.ndarray], None]] = None
        self._stream = None
        self._sd = None

    def set_audio_callback(self, callback: Callable[[np.ndarray], None]):
        """Set callback to receive audio chunks."""
        self._callback = callback

    def _init_audio(self):
        """Initialize audio capture using sounddevice."""
        try:
            import sounddevice as sd
            self._sd = sd
            print("[AudioCapture] sounddevice imported successfully")
            return self._init_sounddevice()
        except ImportError as e:
            print(f"[AudioCapture] sounddevice import failed: {e}")
            return False
        except Exception as e:
            print(f"[AudioCapture] sounddevice error: {e}")
            return False

    def _init_sounddevice(self):
        """Initialize sounddevice stream."""
        try:
            print("[AudioCapture] Querying available audio devices...")
            devices = self._sd.query_devices()
            
            if isinstance(devices, dict):
                print(f"[AudioCapture] Default input device: {devices.get('default_input_device_name', 'N/A')}")
                print(f"[AudioCapture] Default output device: {devices.get('default_output_device_name', 'N/A')}")
                device_count = 1
            else:
                device_count = len(devices) if devices else 0
                print(f"[AudioCapture] Found {device_count} audio devices")
                
                for i, dev in enumerate(devices):
                    if isinstance(dev, dict):
                        name = dev.get('name', f'Device {i}')
                        inputs = dev.get('max_input_channels', 0)
                        print(f"[AudioCapture]   {i}: {name} (inputs: {inputs})")

            device_index = self.device_index
            
            if device_index is None:
                device_index = self._get_loopback_device_index()
            
            if device_index is None:
                device_index = self._sd.query_devices().get('default_input_device')
                print(f"[AudioCapture] Using default device: {device_index}")

            if device_index is None:
                print("[AudioCapture] No audio input device available")
                return False

            print(f"[AudioCapture] Opening audio stream on device {device_index}...")
            
            self._stream = self._sd.InputStream(
                device=device_index,
                channels=self.channels,
                samplerate=self.sample_rate,
                blocksize=self.buffer_size,
                dtype='int16',
                callback=self._audio_callback,
            )
            
            print("[AudioCapture] Audio stream opened successfully")
            return True

        except Exception as e:
            print(f"[AudioCapture] Failed to open audio stream: {e}")
            return False

    def _audio_callback(self, indata, frames, time_info, status):
        """Callback for sounddevice stream."""
        if status:
            print(f"[AudioCapture] Stream status: {status}")
        
        try:
            audio_data = indata.copy()
            if audio_data.shape[1] < self.channels:
                audio_data = np.column_stack([
                    audio_data[:, 0] for _ in range(self.channels)
                ])
            
            audio_int16 = (audio_data * 32767).astype(np.int16)
            self._audio_queue.put_nowait(audio_int16)
        except queue.Full:
            pass

    def _get_loopback_device_index(self) -> Optional[int]:
        """Get loopback device index for sounddevice."""
        try:
            devices = self._sd.query_devices()
            
            loopback_keywords = ['stereo mix', 'loopback', 'what you hear', 'wasapi', 'system audio']
            
            if isinstance(devices, dict):
                devices = [devices]
            
            for i, dev in enumerate(devices):
                if isinstance(dev, dict):
                    name = dev.get('name', '').lower()
                    if any(kw in name for kw in loopback_keywords):
                        print(f"[AudioCapture] Found loopback: {i} - {dev.get('name')}")
                        return i
                    if dev.get('max_input_channels', 0) >= 2:
                        print(f"[AudioCapture] Found stereo device: {i} - {dev.get('name')}")
                        return i
                        
        except Exception as e:
            print(f"[AudioCapture] Error finding loopback: {e}")
        return None

    def start(self) -> bool:
        """Start capturing system audio."""
        if self._running:
            return True

        print("[AudioCapture] Starting...")
        if not self._init_audio():
            print("[AudioCapture] Initialization failed")
            return False

        self._running = True
        
        if self._stream:
            self._stream.start()
            print("[AudioCapture] Stream started")

        return True

    def stop(self):
        """Stop capturing system audio."""
        self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except:
                pass

    def get_audio_chunk(self, timeout: float = 0.1) -> Optional[np.ndarray]:
        """Get next audio chunk from queue."""
        try:
            return self._audio_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def read_all_chunks(self) -> list:
        """Read all available audio chunks from queue."""
        chunks = []
        while True:
            try:
                chunk = self._audio_queue.get_nowait()
                chunks.append(chunk)
            except queue.Empty:
                break
        return chunks


class AudioProcessor:
    """Processes audio data and calculates levels."""

    @staticmethod
    def calculate_rms_level(audio_data: np.ndarray) -> float:
        """Calculate RMS level (0.0 to 1.0)."""
        if audio_data.size == 0:
            return 0.0

        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32) / 32768.0

        rms = np.sqrt(np.mean(audio_data ** 2))
        return min(rms * 2.0, 1.0)

    @staticmethod
    def mono_to_stereo(mono: np.ndarray) -> np.ndarray:
        """Convert mono audio to stereo."""
        if mono.ndim == 2 and mono.shape[1] == 2:
            return mono
        return np.column_stack([mono, mono])

    @staticmethod
    def stereo_to_mono(stereo: np.ndarray) -> np.ndarray:
        """Convert stereo audio to mono."""
        if stereo.ndim == 1:
            return stereo
        return stereo.mean(axis=1)


def get_available_audio_devices():
    """Get list of available audio input devices."""
    devices = []

    try:
        import sounddevice as sd
        device_list = sd.query_devices()
        
        if isinstance(device_list, dict):
            if device_list.get('max_input_channels', 0) > 0:
                devices.append({
                    'index': device_list.get('default_input_device', 0),
                    'name': device_list.get('default_input_device_name', 'Default Input'),
                    'channels': device_list.get('max_input_channels', 0),
                    'sample_rate': device_list.get('default_samplerate', 44100),
                })
        else:
            for i, dev in enumerate(device_list):
                if isinstance(dev, dict) and dev.get('max_input_channels', 0) > 0:
                    devices.append({
                        'index': i,
                        'name': dev.get('name', f'Device {i}'),
                        'channels': dev.get('max_input_channels', 0),
                        'sample_rate': dev.get('default_samplerate', 44100),
                    })
    except ImportError as e:
        print(f"Error querying devices: {e}")
    except Exception as e:
        print(f"Error: {e}")

    return devices