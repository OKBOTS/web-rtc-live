export type SignalMessage =
  | { type: "host"; code: string; hostToken: string }
  | { type: "listener"; code: string }
  | { type: "joined"; role: "host" | "listener"; listenerId?: string }
  | { type: "error"; error: string }
  | { type: "listener-joined"; listenerId: string }
  | { type: "listener-left"; listenerId: string }
  | { type: "listener-count"; count: number }
  | { type: "from-listener"; listenerId: string; payload: { kind: "answer"; sdp: RTCSessionDescriptionInit } | { kind: "ice"; candidate: RTCIceCandidateInit } }
  | { type: "from-host"; payload: { kind: "offer"; sdp: RTCSessionDescriptionInit } | { kind: "ice"; candidate: RTCIceCandidateInit } }
  | { type: "host-ended" }
  | { type: "to-listener"; listenerId: string; payload: { kind: "offer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }
  | { type: "to-host"; payload: { kind: "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } };

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<(msg: SignalMessage) => void> = new Set();
  private closeHandlers: Set<() => void> = new Set();
  public ready = false;
  private queuedMessages: any[] = [];

  constructor() {
    this.connect();
  }

  private connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.ready = true;
      this.queuedMessages.forEach((msg) => this.send(msg));
      this.queuedMessages = [];
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SignalMessage;
        this.messageHandlers.forEach((h) => h(data));
      } catch (e) {
        console.error("Failed to parse signaling message", e);
      }
    };

    this.ws.onclose = () => {
      this.ready = false;
      this.closeHandlers.forEach((h) => h());
    };
    
    this.ws.onerror = (e) => {
      console.error("Signaling websocket error", e);
    }
  }

  send(msg: any) {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queuedMessages.push(msg);
    }
  }

  onMessage(handler: (msg: SignalMessage) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClose(handler: () => void) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
