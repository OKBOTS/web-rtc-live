# Airwave Audio Host

System audio capture application for broadcasting FLAC audio to listeners.

## Requirements

- Windows 10
- Python 3.10+
- FLAC encoder (installed via `flac` command or included)

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Install FLAC encoder:
   - Download from https://xiph.org/flac/download.html
   - Or install via chocolatey: `choco install flac`
   - Or install via winget: `winget install Xiph.FLAC`

## Running (Development)

```bash
python app.py
```

## Building .exe

### Option 1: Using the build script
```bash
python build.py
```

### Option 2: Manual build
```bash
pip install pyinstaller
pyinstaller build.spec
```

### Output
The .exe will be in:
```
dist/airwave-audio-host/airwave-audio-host.exe
```

## Usage

1. Open the application
2. Enter the Server URL (e.g., `ws://localhost:3000/ws`)
3. Enter the Room Code (from the browser broadcast page)
4. Click "Test Connection" to verify connectivity
5. Click "START BROADCAST" to start streaming system audio
6. Open the browser listener page to hear the broadcast

## Audio Format

- Format: FLAC (lossless)
- Sample Rate: 48kHz
- Bit Depth: 16-bit
- Channels: Stereo

## Troubleshooting

### "Failed to start audio capture"
- Make sure you have audio playback device configured
- Try running as Administrator

### "Connection failed"
- Check that the server is running
- Verify the server URL is correct

### Audio not being captured
- Make sure "Stereo Mix" or similar device is available
- On Windows, go to Sound Settings > Input to verify