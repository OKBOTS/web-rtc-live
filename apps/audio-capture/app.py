#!/usr/bin/env python3
"""
Airwave Audio Host - System Audio Capture to FLAC Streaming
"""

import tkinter as tk
from tkinter import ttk, messagebox
import threading
import json
import time
import numpy as np
import requests
from typing import Optional

from audio_capture import SystemAudioCapture, AudioProcessor
from flac_encoder import SimpleFlacEncoder
from websocket_client import FLACWebSocketClient


class AirwaveAudioHost:
    """Main application with Tkinter UI."""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Airwave Audio Host")
        self.root.geometry("500x580")
        self.root.resizable(False, False)

        self.server_url = tk.StringVar(value="http://localhost:3000")
        self.room_title = tk.StringVar(value="My Broadcast")
        self.host_name = tk.StringVar(value="Host")
        self.room_code = tk.StringVar()
        self.host_token = tk.StringVar()
        self.status = tk.StringVar(value="Not Connected")
        self.listener_count = tk.IntVar(value=0)
        self.audio_level = tk.DoubleVar(value=0.0)
        self.is_broadcasting = tk.BooleanVar(value=False)
        self.is_room_created = tk.BooleanVar(value=False)

        self.audio_capture: Optional[SystemAudioCapture] = None
        self.flac_encoder: Optional[SimpleFlacEncoder] = None
        self.ws_client: Optional[FLACWebSocketClient] = None

        self._capture_thread: Optional[threading.Thread] = None
        self._encode_thread: Optional[threading.Thread] = None
        self._running = False
        self._base_url = ""

        self._load_config()
        self._setup_ui()

    def _load_config(self):
        """Load saved configuration."""
        try:
            import os
            config_path = os.path.join(os.path.dirname(__file__), 'config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    if 'server_url' in config:
                        self.server_url.set(config['server_url'])
                    if 'room_title' in config:
                        self.room_title.set(config['room_title'])
                    if 'host_name' in config:
                        self.host_name.set(config['host_name'])
        except Exception:
            pass

    def _save_config(self):
        """Save configuration to file."""
        try:
            import os
            config_path = os.path.join(os.path.dirname(__file__), 'config.json')
            with open(config_path, 'w') as f:
                json.dump({
                    'server_url': self.server_url.get(),
                    'room_title': self.room_title.get(),
                    'host_name': self.host_name.get(),
                }, f)
        except Exception:
            pass

    def _setup_ui(self):
        """Setup the user interface."""
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        title_label = ttk.Label(
            main_frame,
            text="Airwave Audio Host",
            font=("Segoe UI", 18, "bold"),
        )
        title_label.pack(pady=(0, 15))

        setup_frame = ttk.LabelFrame(main_frame, text="Setup", padding="10")
        setup_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(setup_frame, text="Server URL:").grid(row=0, column=0, sticky=tk.W, pady=5)
        server_entry = ttk.Entry(setup_frame, textvariable=self.server_url, width=35)
        server_entry.grid(row=0, column=1, pady=5, padx=(10, 0))

        ttk.Label(setup_frame, text="Broadcast Title:").grid(row=1, column=0, sticky=tk.W, pady=5)
        title_entry = ttk.Entry(setup_frame, textvariable=self.room_title, width=35)
        title_entry.grid(row=1, column=1, pady=5, padx=(10, 0))

        ttk.Label(setup_frame, text="Host Name:").grid(row=2, column=0, sticky=tk.W, pady=5)
        host_entry = ttk.Entry(setup_frame, textvariable=self.host_name, width=35)
        host_entry.grid(row=2, column=1, pady=5, padx=(10, 0))

        self.create_room_btn = ttk.Button(
            setup_frame,
            text="Create Room",
            command=self._create_room,
            width=20,
        )
        self.create_room_btn.grid(row=3, column=0, columnspan=2, pady=10)

        connection_frame = ttk.LabelFrame(main_frame, text="Connection", padding="10")
        connection_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(connection_frame, text="Room Code:").grid(row=0, column=0, sticky=tk.W, pady=5)
        room_code_label = ttk.Label(
            connection_frame,
            textvariable=self.room_code,
            font=("Segoe UI", 12, "bold"),
            foreground="blue"
        )
        room_code_label.grid(row=0, column=1, pady=5, padx=(10, 0))

        ttk.Label(connection_frame, text="Status:").grid(row=1, column=0, sticky=tk.W, pady=5)
        status_value = ttk.Label(
            connection_frame,
            textvariable=self.status,
            font=("Segoe UI", 10, "bold")
        )
        status_value.grid(row=1, column=1, pady=5, padx=(10, 0))

        audio_source_label = ttk.Label(connection_frame, text="Audio: System Audio (WASAPI)")
        audio_source_label.grid(row=2, column=0, columnspan=2, sticky=tk.W, pady=(5, 0))

        level_frame = ttk.LabelFrame(main_frame, text="Audio Level", padding="10")
        level_frame.pack(fill=tk.X, pady=(0, 10))

        self.level_canvas = tk.Canvas(level_frame, height=20, bg="#222222")
        self.level_canvas.pack(fill=tk.X)
        self.level_bar = self.level_canvas.create_rectangle(0, 0, 0, 20, fill="#00ff00", outline="")

        control_frame = ttk.Frame(main_frame)
        control_frame.pack(fill=tk.X, pady=(0, 10))

        self.start_btn = ttk.Button(
            control_frame,
            text="START BROADCAST",
            command=self._toggle_broadcast,
            state=tk.DISABLED,
            width=20,
        )
        self.start_btn.pack()

        listener_frame = ttk.LabelFrame(main_frame, text="Listeners", padding="10")
        listener_frame.pack(fill=tk.X)

        listener_label = ttk.Label(listener_frame, text="Connected:")
        listener_label.pack(side=tk.LEFT)
        listener_count_label = ttk.Label(
            listener_frame,
            textvariable=self.listener_count,
            font=("Segoe UI", 14, "bold"),
        )
        listener_count_label.pack(side=tk.LEFT, padx=(10, 0))

        info_label = ttk.Label(
            main_frame,
            text="Format: FLAC 96kHz 24-bit Stereo (Studio Quality)",
            font=("Segoe UI", 8),
            foreground="gray",
        )
        info_label.pack(pady=(10, 0))

    def _create_room(self):
        """Create a room via API."""
        server_url = self.server_url.get().strip()
        title = self.room_title.get().strip()
        host_name = self.host_name.get().strip()

        if not server_url:
            messagebox.showerror("Error", "Please enter a server URL")
            return

        if not title:
            messagebox.showerror("Error", "Please enter a broadcast title")
            return

        if not host_name:
            messagebox.showerror("Error", "Please enter a host name")
            return

        self.status.set("Creating room...")
        self.root.update()

        try:
            self._base_url = server_url.rstrip('/')

            api_url = f"{self._base_url}/api/rooms"
            response = requests.post(
                api_url,
                json={
                    "title": title,
                    "hostName": host_name,
                    "sourceType": "tab"
                },
                timeout=10
            )

            if response.status_code == 201:
                data = response.json()
                room_code = data.get("room", {}).get("code")
                host_token = data.get("hostToken")

                if room_code and host_token:
                    self.room_code.set(room_code)
                    self.host_token.set(host_token)
                    self.is_room_created.set(True)
                    self.start_btn.config(state=tk.NORMAL)
                    self.status.set("Room created - Ready to broadcast")
                    self._save_config()
                    messagebox.showinfo("Success", f"Room created!\nRoom Code: {room_code}")
                    return
                else:
                    messagebox.showerror("Error", "Invalid response from server")
            else:
                error_msg = f"Server error: {response.status_code}\n"
                try:
                    error_data = response.json()
                    error_msg += error_data.get("message", error_data.get("error", "Unknown"))
                except:
                    error_msg += response.text[:200] if response.text else "No details"
                messagebox.showerror("Error", error_msg)

        except requests.exceptions.ConnectionError:
            messagebox.showerror("Error", "Cannot connect to server.\nMake sure the server is running.")
        except requests.exceptions.Timeout:
            messagebox.showerror("Error", "Request timed out.")
        except Exception as e:
            messagebox.showerror("Error", f"Error: {str(e)}")

        self.status.set("Not Connected")

    def _test_connection(self):
        """Test the WebSocket connection."""
        if not self.is_room_created.get():
            messagebox.showerror("Error", "Please create a room first")
            return

        server_url = self.server_url.get().strip()
        room_code = self.room_code.get().strip()
        ws_url = server_url.replace("http", "ws") + "/ws"

        self.status.set("Testing...")
        self.root.update()

        try:
            import websocket

            ws = websocket.WebSocket()
            ws.settimeout(5)
            ws.connect(ws_url)

            connect_msg = json.dumps({
                "type": "flac-host-connect",
                "code": room_code,
                "hostToken": self.host_token.get()
            })
            ws.send(connect_msg)

            response = ws.recv()
            ws.close()

            data = json.loads(response)
            if data.get("type") == "joined":
                self.status.set("Connected")
                messagebox.showinfo("Success", "Connection successful!")
                return
            else:
                messagebox.showerror("Error", f"Server error: {data.get('error', 'Unknown')}")

        except Exception as e:
            messagebox.showerror("Error", f"Connection failed: {str(e)}")

        self.status.set("Not Connected")

    def _toggle_broadcast(self):
        """Toggle broadcast on/off."""
        if self.is_broadcasting.get():
            self._stop_broadcast()
        else:
            self._start_broadcast()

    def _start_broadcast(self):
        """Start broadcasting audio."""
        if not self.is_room_created.get():
            messagebox.showerror("Error", "Please create a room first")
            return

        server_url = self.server_url.get().strip()
        room_code = self.room_code.get().strip()
        host_token = self.host_token.get().strip()
        ws_url = server_url.replace("http", "ws") + "/ws"

        try:
            self.ws_client = FLACWebSocketClient(ws_url, room_code, host_token)
            self.ws_client.set_connected_callback(self._on_ws_connected)
            self.ws_client.set_disconnected_callback(self._on_ws_disconnected)
            self.ws_client.set_error_callback(self._on_ws_error)
            self.ws_client.set_listener_count_callback(self._on_listener_count_update)

            if not self.ws_client.connect():
                messagebox.showerror("Error", "Failed to connect to server")
                return

        except Exception as e:
            messagebox.showerror("Error", f"Connection error: {str(e)}")
            return

        print("[App] Creating audio capture...")
        self.audio_capture = SystemAudioCapture(
            sample_rate=96000,
            channels=2,
            buffer_size=4096,
        )
        print("[App] Audio capture created")

        self.flac_encoder = SimpleFlacEncoder(
            sample_rate=96000,
            channels=2,
            bits_per_sample=24,
        )

        self._running = True
        self.is_broadcasting.set(True)
        self.status.set("LIVE")
        self.start_btn.config(text="STOP BROADCAST")

        print("[App] Starting capture thread...")
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._capture_thread.start()
        print("[App] Capture thread started")

        self._encode_thread = threading.Thread(target=self._encode_loop, daemon=True)
        self._encode_thread.start()

    def _stop_broadcast(self):
        """Stop broadcasting audio."""
        self._running = False

        if self.audio_capture:
            self.audio_capture.stop()
            self.audio_capture = None

        if self.ws_client:
            try:
                server_url = self.server_url.get().strip().replace("http", "ws") + "/ws"
                import websocket
                ws = websocket.WebSocket()
                ws.settimeout(3)
                ws.connect(server_url)
                ws.send(json.dumps({"type": "flac-host-disconnect"}))
                ws.close()
            except:
                pass

            self.ws_client = None

        self.is_broadcasting.set(False)
        self.status.set("Connected")
        self.start_btn.config(text="START BROADCAST")
        self.listener_count.set(0)
        self.audio_level.set(0)
        self._update_level_bar(0)

    def _capture_loop(self):
        """Capture audio in background thread."""
        if not self.audio_capture:
            return

        if not self.audio_capture.start():
            self.root.after(0, lambda: messagebox.showerror("Error", "Failed to start audio capture"))
            self.root.after(0, self._stop_broadcast)
            return

        while self._running:
            chunk = self.audio_capture.get_audio_chunk(timeout=0.1)
            if chunk is not None and self.flac_encoder:
                if chunk.ndim == 1:
                    chunk = np.column_stack([chunk, chunk])
                self.flac_encoder.add_audio(chunk)

                level = AudioProcessor.calculate_rms_level(chunk)
                if level > 0.01:
                    print(f"[Audio] Level: {level:.3f}")
                self.root.after(0, lambda l=level: self._update_level(l))

            time.sleep(0.01)

    def _encode_loop(self):
        """Encode and send audio in background thread."""
        last_send_time = time.time()

        while self._running:
            time.sleep(0.05)

            if not self.flac_encoder or not self.ws_client:
                continue

            chunks = self.flac_encoder.get_encoded_chunks(min_samples=4800)
            current_time = time.time()

            if current_time - last_send_time >= 0.1 and chunks:
                audio_data = b''.join(chunks[:1])
                if self.ws_client.is_connected():
                    self.ws_client.send_audio_data_async(audio_data)
                last_send_time = current_time

    def _update_level(self, level: float):
        """Update audio level display."""
        self.audio_level.set(level)
        self._update_level_bar(level)

    def _update_level_bar(self, level: float):
        """Update the level bar visualization."""
        if hasattr(self, 'level_canvas'):
            width = self.level_canvas.winfo_width()
            if width > 0:
                bar_width = int(width * min(level, 1.0))
                self.level_canvas.coords(self.level_bar, 0, 0, bar_width, 20)

                color = "#00ff00" if level < 0.8 else "#ffaa00" if level < 0.95 else "#ff0000"
                self.level_canvas.itemconfig(self.level_bar, fill=color)

    def _on_ws_connected(self):
        """Callback when WebSocket connects."""
        self.root.after(0, lambda: self.status.set("LIVE"))

    def _on_ws_disconnected(self):
        """Callback when WebSocket disconnects."""
        self.root.after(0, self._stop_broadcast)
        self.root.after(0, lambda: messagebox.showwarning("Warning", "Disconnected from server"))

    def _on_ws_error(self, error: str):
        """Callback when WebSocket error occurs."""
        self.root.after(0, lambda: messagebox.showerror("Error", f"WebSocket error: {error}"))

    def _on_listener_count_update(self, count: int):
        """Callback when listener count updates."""
        self.root.after(0, lambda: self.listener_count.set(count))

    def run(self):
        """Run the application."""
        self.root.mainloop()


def main():
    app = AirwaveAudioHost()
    app.run()


if __name__ == "__main__":
    main()