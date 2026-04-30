import threading
import queue
import numpy as np
from typing import Optional, Callable
import time


class SystemAudioCapture:
    """Captures system audio using WASAPI loopback on Windows."""

    def __init__(
        self,
        sample_rate: int = 96000,
        channels: int = 2,
        buffer_size: int = 4096,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.buffer_size = buffer_size
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue = queue.Queue(maxsize=100)
        self._callback: Optional[Callable[[np.ndarray], None]] = None
        self._stream = None

    def set_audio_callback(self, callback: Callable[[np.ndarray], None]):
        """Set callback to receive audio chunks."""
        self._callback = callback

    def _init_audio(self):
        """Initialize audio capture. Uses sounddevice as primary, falls back to pyaudio."""
        try:
            import sounddevice as sd
            self._sd = sd
            self._use_sounddevice = True
            return True
        except ImportError:
            pass

        try:
            import pyaudio
            self._pyaudio = pyaudio.PyAudio()
            self._use_sounddevice = False
            return self._init_pyaudio()
        except ImportError:
            return False

    def _init_pyaudio(self):
        """Initialize pyaudio stream."""
        self._stream = self._pyaudio.open(
            format=pyaudio.paInt16,
            channels=self.channels,
            rate=self.sample_rate,
            input=True,
            input_device_index=self._get_loopback_device_index(),
            frames_per_buffer=self.buffer_size,
            stream_callback=self._pyaudio_callback,
        )
        return True

    def _get_loopback_device_index(self) -> Optional[int]:
        """Find the loopback (WASAPI) device index."""
        if not hasattr(self, '_pyaudio'):
            return None

        info = self._pyaudio.get_device_info_by_index(0)
        # Look for "Stereo Mix" or similar
        for i in range(self._pyaudio.get_device_count()):
            info = self._pyaudio.get_device_info_by_index(i)
            name = info['name'].lower()
            if 'stereo mix' in name or 'loopback' in name or 'what you hear' in name:
                return i
        return None

    def _pyaudio_callback(self, in_data, frame_count, time_info, status):
        """Callback for pyaudio stream."""
        if status:
            print(f"Audio callback status: {status}")

        audio_data = np.frombuffer(in_data, dtype=np.int16)
        if self.channels == 2:
            audio_data = audio_data.reshape(-1, 2)

        try:
            self._audio_queue.put_nowait(audio_data)
        except queue.Full:
            pass

        return (in_data, pyaudio.paContinue)

    def start(self) -> bool:
        """Start capturing system audio."""
        if self._running:
            return True

        if not self._init_audio():
            return False

        self._running = True

        if self._use_sounddevice:
            self._thread = threading.Thread(target=self._sounddevice_capture, daemon=True)
            self._thread.start()
        else:
            self._stream.start_stream()

        return True

    def _sounddevice_capture(self):
        """Capture using sounddevice with loopback."""
        try:
            self._sd.rec(
                blocksize=self.buffer_size,
                dtype='int16',
                channels=self.channels,
                samplerate=self.sample_rate,
                device=self._get_sounddevice_device_index(),
            )
        except Exception as e:
            print(f"Sounddevice capture error: {e}")

    def _get_sounddevice_device_index(self) -> Optional[int]:
        """Get loopback device index for sounddevice."""
        try:
            devices = self._sd.query_devices()
            for i, dev in enumerate(devices):
                name = dev.get('name', '').lower()
                if 'stereo mix' in name or 'loopback' in name:
                    return i
        except:
            pass
        return None

    def stop(self):
        """Stop capturing system audio."""
        self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

        if hasattr(self, '_stream') and self._stream:
            try:
                self._stream.stop_stream()
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
        return min(rms * 2.0, 1.0)  # Scale up for better visualization

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
        for i, dev in enumerate(sd.query_devices()):
            if dev['max_input_channels'] > 0:
                devices.append({
                    'index': i,
                    'name': dev['name'],
                    'channels': dev['max_input_channels'],
                    'sample_rate': dev['default_samplerate'],
                })
    except ImportError:
        pass

    return devices