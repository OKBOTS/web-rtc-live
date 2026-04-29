import { useState, useEffect, useRef } from "react";
import { SignalingClient, SignalMessage } from "../lib/signaling";

const STUN_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export function useWebRTCHost(code: string, hostToken: string, stream: MediaStream | null) {
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const clientRef = useRef<SignalingClient | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  useEffect(() => {
    if (!stream || !code || !hostToken) return;

    const client = new SignalingClient();
    clientRef.current = client;

    client.send({ type: "host", code, hostToken });

    const handleMessage = async (msg: SignalMessage) => {
      if (msg.type === "error") {
        setError(msg.error);
      } else if (msg.type === "listener-count") {
        setListenerCount(msg.count);
      } else if (msg.type === "listener-joined") {
        const { listenerId } = msg;
        const pc = new RTCPeerConnection(STUN_CONFIG);
        pcsRef.current.set(listenerId, pc);

        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            client.send({
              type: "to-listener",
              listenerId,
              payload: { kind: "ice", candidate: event.candidate },
            });
          }
        };

        const offer = await pc.createOffer({ offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);

        client.send({
          type: "to-listener",
          listenerId,
          payload: { kind: "offer", sdp: pc.localDescription! },
        });
      } else if (msg.type === "from-listener") {
        const { listenerId, payload } = msg;
        const pc = pcsRef.current.get(listenerId);
        if (!pc) return;

        if (payload.kind === "answer") {
          await pc.setRemoteDescription(payload.sdp);
        } else if (payload.kind === "ice") {
          await pc.addIceCandidate(payload.candidate);
        }
      } else if (msg.type === "listener-left") {
        const { listenerId } = msg;
        const pc = pcsRef.current.get(listenerId);
        if (pc) {
          pc.close();
          pcsRef.current.delete(listenerId);
        }
      }
    };

    const cleanup = client.onMessage(handleMessage);

    return () => {
      cleanup();
      client.close();
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
    };
  }, [code, hostToken, stream]);

  return { listenerCount, error };
}
