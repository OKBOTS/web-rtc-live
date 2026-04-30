import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useGetRoom } from "@workspace/api-client-react";
import { useWebRTCListener } from "@/hooks/useWebRTCListener";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  AlertCircle,
  Users,
  Radio,
  Loader2,
  Volume2,
  VolumeX,
  ArrowLeft,
  Mic2,
  Globe,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ListenRoom() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: room, isLoading: isLoadingRoom } = useGetRoom(code || "", {
    query: { enabled: !!code, refetchInterval: 5000 },
  });

  const {
    stream,
    connectionState,
    listenerCount,
    error: signalingError,
  } = useWebRTCListener(code || "");

  useEffect(() => {
    if (stream && audioRef.current) {
      audioRef.current.srcObject = stream;
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!audioRef.current || !stream) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const toggleMute = () => setIsMuted((m) => !m);

  if (isLoadingRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Radio className="h-9 w-9 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">No signal</h2>
            <p className="text-muted-foreground">
              This broadcast doesn't exist or has already ended.
            </p>
          </div>
          <Button onClick={() => setLocation("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Airwave
          </Button>
        </div>
      </div>
    );
  }

  const isEnded = connectionState === "ended";
  const isLive = connectionState === "live";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-bold tracking-tight leading-none truncate">{room.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">by {room.hostName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ConnectionStatus state={connectionState} />
          <div className="flex items-center gap-1.5 font-mono text-sm bg-card px-2.5 py-1 rounded-md border border-border">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-bold tabular-nums">{listenerCount}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Visualizer area */}
        <div className="relative flex-1 bg-black min-h-[280px] sm:min-h-[380px]">
          {stream ? (
            <div className="absolute inset-0">
              <AudioVisualizer stream={stream} isPlaying={isPlaying} />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <Radio className="h-16 w-16 text-primary/20" />
                {!isEnded && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-20 w-20 text-primary/30 animate-spin" />
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground/40 tracking-widest uppercase">
                {isEnded ? "Broadcast ended" : "Waiting for signal…"}
              </p>
            </div>
          )}

          {/* Overlay play button */}
          {stream && !isPlaying && isLive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-20">
              <button
                onClick={togglePlay}
                className="group w-28 h-28 rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center transition-all hover:bg-primary/20 hover:border-primary hover:shadow-[0_0_60px_-10px_hsl(var(--primary))]"
                data-testid="button-play-overlay"
              >
                <Play className="h-12 w-12 text-primary ml-2 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          )}

          {/* Broadcast info overlay (bottom-left) */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
            <div className="bg-background/70 backdrop-blur-md border border-border/50 rounded-md px-3 py-1.5 text-xs font-mono text-muted-foreground flex items-center gap-2">
              {room.sourceType === "tab" ? (
                <Globe className="h-3 w-3" />
              ) : (
                <Mic2 className="h-3 w-3" />
              )}
              {room.sourceType === "tab" ? "SYSTEM AUDIO" : "MICROPHONE"}
            </div>
            <div className="bg-background/70 backdrop-blur-md border border-border/50 rounded-md px-3 py-1.5 text-xs font-mono text-muted-foreground">
              OPUS 48kHz
            </div>
          </div>
        </div>

        {/* Alerts */}
        {(signalingError || isEnded) && (
          <div className="px-4 pt-4">
            {signalingError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Connection Error</AlertTitle>
                <AlertDescription>{signalingError}</AlertDescription>
              </Alert>
            )}
            {isEnded && (
              <Alert className="border-primary/30 bg-primary/5">
                <Radio className="h-4 w-4 text-primary" />
                <AlertTitle>Broadcast ended</AlertTitle>
                <AlertDescription>
                  The host has ended this session.{" "}
                  <button
                    className="underline underline-offset-2 hover:text-primary"
                    onClick={() => setLocation("/")}
                  >
                    Return home
                  </button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Transport bar */}
        <div className="border-t border-border/40 bg-card/60 backdrop-blur px-4 sm:px-8 py-5 flex items-center gap-6">
          {/* Play / Pause */}
          <Button
            size="icon"
            variant={isPlaying ? "outline" : "default"}
            className={`h-14 w-14 rounded-full shrink-0 transition-all ${
              !isPlaying && stream
                ? "shadow-[0_0_30px_-5px_hsl(var(--primary))]"
                : ""
            }`}
            onClick={togglePlay}
            disabled={!stream || !isLive}
            data-testid="button-transport-play"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-0.5" />
            )}
          </Button>

          {/* Volume */}
          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <button
              onClick={toggleMute}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (v > 0) setIsMuted(false);
              }}
              className="flex-1 accent-primary h-1.5 cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {/* Signal quality */}
          <div className="hidden sm:flex flex-col items-end font-mono text-xs text-muted-foreground gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  stream
                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]"
                    : "bg-muted"
                }`}
              />
              <span className={stream ? "text-foreground" : ""}>
                {stream ? "EXCELLENT" : "NO SIGNAL"}
              </span>
            </div>
          </div>
        </div>
      </main>

      <audio ref={audioRef} autoPlay={false} className="hidden" />
    </div>
  );
}
