import subprocess
import tempfile
import os
import threading
import queue
import numpy as np
from typing import Optional


class FlacEncoder:
    """Encodes audio to FLAC format using command-line flac encoder."""

    def __init__(
        self,
        sample_rate: int = 48000,
        channels: int = 2,
        bits_per_sample: int = 16,
        compression_level: int = 5,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.bits_per_sample = bits_per_sample
        self.compression_level = compression_level

        self._buffer = np.array([], dtype=np.int16)
        self._buffer_lock = threading.Lock()
        self._min_samples = sample_rate // 10  # At least 100ms of audio

    def add_audio(self, audio_data: np.ndarray):
        """Add audio data to encoding buffer."""
        if audio_data.dtype != np.int16:
            audio_data = (audio_data * 32767).astype(np.int16)

        if audio_data.ndim == 1:
            audio_data = np.column_stack([audio_data, audio_data])

        with self._buffer_lock:
            self._buffer = np.concatenate([self._buffer, audio_data])

    def encode_ready_chunks(self, min_samples: Optional[int] = None) -> list:
        """Encode all ready chunks and return list of FLAC data."""
        if min_samples is None:
            min_samples = self._min_samples

        encoded_chunks = []

        with self._buffer_lock:
            while len(self._buffer) >= min_samples:
                chunk = self._buffer[:min_samples]
                self._buffer = self._buffer[min_samples:]

                flac_data = self._encode_chunk(chunk)
                if flac_data:
                    encoded_chunks.append(flac_data)

        return encoded_chunks

    def _encode_chunk(self, audio_chunk: np.ndarray) -> Optional[bytes]:
        """Encode a single audio chunk to FLAC."""
        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as wav_file:
                wav_path = wav_file.name

            with tempfile.NamedTemporaryFile(suffix='.flac', delete=False) as flac_file:
                flac_path = flac_file.name

            self._write_wav(wav_path, audio_chunk)

            result = subprocess.run(
                [
                    'flac',
                    '-f',
                    '-o', flac_path,
                    '-',  # stdin
                    '--sample-rate', str(self.sample_rate),
                    '--channels', str(self.channels),
                    '--bits-per-sample', str(self.bits_per_sample),
                    '-', str(self.compression_level),
                ],
                input=self._wav_data(wav_path, audio_chunk),
                capture_output=True,
                timeout=5,
            )

            os.unlink(wav_path)

            if result.returncode == 0 and os.path.exists(flac_path):
                with open(flac_path, 'rb') as f:
                    flac_data = f.read()
                os.unlink(flac_path)
                return flac_data

        except Exception as e:
            print(f"FLAC encoding error: {e}")

        return None

    def _wav_data(self, path: str, audio: np.ndarray):
        """Generate WAV file content."""
        import wave
        import io

        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav:
            wav.setnchannels(self.channels)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes(audio.tobytes())

        return buffer.getvalue()

    def _write_wav(self, path: str, audio: np.ndarray):
        """Write audio data to WAV file."""
        import wave
        with wave.open(path, 'wb') as wav:
            wav.setnchannels(self.channels)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes(audio.tobytes())

    def clear_buffer(self):
        """Clear the encoding buffer."""
        with self._buffer_lock:
            self._buffer = np.array([], dtype=np.int16)


class SimpleFlacEncoder:
    """Raw PCM encoder - sends audio as-is for browser to handle."""

    def __init__(
        self,
        sample_rate: int = 96000,
        channels: int = 2,
        bits_per_sample: int = 16,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.bits_per_sample = bits_per_sample
        self._buffer = np.array([], dtype=np.int16)
        self._buffer_lock = threading.Lock()

    def add_audio(self, audio_data: np.ndarray):
        """Add audio data to buffer."""
        if audio_data.dtype != np.int16:
            audio_data = (audio_data * 32767).astype(np.int16)

        if audio_data.ndim == 1:
            audio_data = np.column_stack([audio_data, audio_data])

        with self._buffer_lock:
            self._buffer = np.concatenate([self._buffer, audio_data])

    def get_encoded_chunks(self, min_samples: int = 4800) -> list:
        """Get raw PCM chunks with WAV header."""
        chunks = []
        
        with self._buffer_lock:
            while len(self._buffer) >= min_samples:
                chunk = self._buffer[:min_samples]
                self._buffer = self._buffer[min_samples:]
                
                wav_data = self._create_wav(chunk)
                chunks.append(wav_data)
                print(f"[PCM] Created WAV: {len(wav_data)} bytes")
        
        return chunks

    def _create_wav(self, audio_data: np.ndarray) -> bytes:
        """Create WAV file bytes."""
        import wave
        import io
        
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav:
            wav.setnchannels(self.channels)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes(audio_data.tobytes())
        
        return buffer.getvalue()

    def clear(self):
        """Clear buffer."""
        with self._buffer_lock:
            self._buffer = np.array([], dtype=np.int16)

    @property
    def buffer_size(self) -> int:
        """Get current buffer size in samples."""
        with self._buffer_lock:
            return len(self._buffer)


def check_flac_available() -> bool:
    """Check if FLAC command-line tool is available."""
    try:
        result = subprocess.run(
            ['flac', '--version'],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False