import { useState, useEffect, useRef } from "react";
import { SignalingClient, SignalMessage } from "../lib/signaling";

const STUN_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export type ConnectionState = "connecting" | "live" | "disconnected" | "ended";

export function useWebRTCListener(code: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<SignalingClient | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!code) return;

    const client = new SignalingClient();
    clientRef.current = client;

    client.send({ type: "listener", code });

    const pc = new RTCPeerConnection(STUN_CONFIG);
    pcRef.current = pc;

    pc.ontrack = (event) => {
      setStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        client.send({
          type: "to-host",
          payload: { kind: "ice", candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnectionState("live");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setConnectionState("disconnected");
      }
    };

    const handleMessage = async (msg: SignalMessage) => {
      if (msg.type === "error") {
        setError(msg.error);
        setConnectionState("disconnected");
      } else if (msg.type === "listener-count") {
        setListenerCount(msg.count);
      } else if (msg.type === "from-host") {
        const { payload } = msg;
        if (payload.kind === "offer") {
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          client.send({
            type: "to-host",
            payload: { kind: "answer", sdp: pc.localDescription! },
          });
        } else if (payload.kind === "ice") {
          await pc.addIceCandidate(payload.candidate);
        }
      } else if (msg.type === "host-ended") {
        setConnectionState("ended");
        pc.close();
      }
    };

    const cleanup = client.onMessage(handleMessage);

    return () => {
      cleanup();
      client.close();
      pc.close();
    };
  }, [code]);

  return { stream, connectionState, listenerCount, error };
}
