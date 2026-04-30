import { useState, useEffect, useRef } from "react";
import { FlacListener } from "../lib/flacListener";

export type FlacConnectionState = "connecting" | "live" | "disconnected" | "ended";

export function useFlacListener(code: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<FlacConnectionState>("connecting");
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const flacListenerRef = useRef<FlacListener | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!code) return;

    setConnectionState("connecting");
    setError(null);

    const serverUrl = location.host;

    const listener = new FlacListener(
      code,
      serverUrl,
      {
        onConnected: () => {
          setConnectionState("live");
        },
        onDisconnected: () => {
          setConnectionState("disconnected");
        },
        onError: (err) => {
          setError(err);
          setConnectionState("disconnected");
        },
        onHostEnded: () => {
          setConnectionState("ended");
          if (flacListenerRef.current) {
            flacListenerRef.current.disconnect();
          }
        },
      }
    );

    flacListenerRef.current = listener;

    listener.connect().catch((err) => {
      setError(err.message);
      setConnectionState("disconnected");
    });

    return () => {
      listener.disconnect();
      flacListenerRef.current = null;
    };
  }, [code]);

  const play = async () => {
    if (flacListenerRef.current) {
      await flacListenerRef.current.play();
    }
  };

  const pause = async () => {
    if (flacListenerRef.current) {
      await flacListenerRef.current.pause();
    }
  };

  const setVolume = (volume: number) => {
    if (flacListenerRef.current) {
      flacListenerRef.current.setVolume(volume);
    }
  };

  return { 
    connectionState, 
    error,
    play,
    pause,
    setVolume,
  };
}