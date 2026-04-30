type FlacListenerCallbacks = {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
  onHostEnded: () => void;
};

export class FlacListener {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private audioDecoder: AudioDecoder | null = null;
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
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          await this.handleAudioData(event.data);
        } else {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "joined" && data.role === "flac-listener") {
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
      await this.audioContext.audioWorklet.addModule("/audio-processor.js");
    } catch (e) {
      console.error("Failed to add audio worklet module", e);
    }

    this.sourceNode = new AudioWorkletNode(
      this.audioContext,
      "flac-processor"
    );
    this.sourceNode.connect(this.gainNode);

    const supported = await AudioDecoder.isConfigSupported({
      codec: "flac",
      sampleRate: 96000,
      numberOfChannels: 2
    });

    if (!supported.supported) {
      throw new Error("FLAC codec not supported");
    }

    this.audioDecoder = new AudioDecoder({
      output: (data) => {
        this.sourceNode?.port.postMessage(data);
      },
      error: (error) => {
        console.error("AudioDecoder error", error);
      }
    });

    await this.audioDecoder.configure({
      codec: "flac",
      sampleRate: 96000,
      numberOfChannels: 2
    });
  }

  private async handleAudioData(data: ArrayBuffer | Blob): Promise<void> {
    if (!this.audioDecoder) return;

    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const chunk = new EncodedAudioChunk({
      type: "key",
      timestamp: 0,
      duration: 48000,
      data: buffer
    });

    try {
      await this.audioDecoder.decode(chunk);
    } catch (e) {
      console.error("Failed to decode audio", e);
    }
  }

  disconnect(): void {
    if (this.audioDecoder) {
      this.audioDecoder.close();
      this.audioDecoder = null;
    }

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