type FlacListenerCallbacks = {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
  onHostEnded: () => void;
};

export class FlacListener {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private callbacks: FlacListenerCallbacks;
  private roomCode: string;
  private serverUrl: string;
  private isConnected = false;

  constructor(roomCode: string, serverUrl: string, callbacks: FlacListenerCallbacks) {
    this.roomCode = roomCode;
    this.serverUrl = serverUrl;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${this.serverUrl}/ws`;

    this.ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("Failed to create WebSocket"));
        return;
      }

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({
          type: "flac-listener",
          code: this.roomCode
        }));
      };

      this.ws.onmessage = async (event) => {
        console.log("[FlacListener] Received message:", typeof event.data, event.data);
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          console.log("[FlacListener] Audio data received, size:", event.data instanceof Blob ? (event.data as Blob).size : (event.data as ArrayBuffer).byteLength);
          await this.handleAudioData(event.data);
        } else {
          try {
            const data = JSON.parse(event.data);
            console.log("[FlacListener] Parsed JSON:", data);
            console.log("[FlacListener] Checking condition:", data.type, data.role);
            if (data.type === "joined" && data.role === "flac-listener") {
              console.log("[FlacListener] MATCH! Setting connected...");
              this.isConnected = true;
              await this.initAudio();
              this.callbacks.onConnected();
              resolve();
            } else if (data.type === "flac-host-ended") {
              this.callbacks.onHostEnded();
            } else if (data.type === "error") {
              this.callbacks.onError(data.error);
              reject(new Error(data.error));
            }
          } catch (e) {
            console.error("Failed to parse message", e);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error", error);
        this.callbacks.onError("Connection error");
        reject(error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onDisconnected();
      };
    });
  }

  private async initAudio(): Promise<void> {
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);

    try {
      await this.audioContext.audioWorklet.addModule("/wav-processor.js");
    } catch (e) {
      console.error("Failed to add audio worklet module", e);
    }

    this.sourceNode = new AudioWorkletNode(
      this.audioContext,
      "wav-processor"
    );
    this.sourceNode.connect(this.gainNode);
    console.log("[FlacListener] AudioWorklet initialized");
  }

  private async handleAudioData(data: ArrayBuffer | Blob): Promise<void> {
    if (!this.sourceNode) return;

    try {
      const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
      const int16Array = new Int16Array(buffer);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      console.log("[FlacListener] Sending PCM to worklet:", float32Array.length, "samples");
      this.sourceNode.port.postMessage(float32Array);
    } catch (e) {
      console.error("Failed to process audio", e);
    }
  }

  disconnect(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  get isPlaying(): boolean {
    return this.audioContext?.state === "running";
  }

  async play(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async pause(): Promise<void> {
    if (this.audioContext?.state === "running") {
      await this.audioContext.suspend();
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }
}