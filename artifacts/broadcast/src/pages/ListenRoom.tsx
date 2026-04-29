import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useGetRoom } from "@workspace/api-client-react";
import { useWebRTCListener } from "@/hooks/useWebRTCListener";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, AlertCircle, Users, Radio, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ListenRoom() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const { data: room, isLoading: isLoadingRoom } = useGetRoom(code || "", { 
    query: { enabled: !!code, refetchInterval: 5000 } 
  });
  
  const { stream, connectionState, listenerCount, error: signalingError } = useWebRTCListener(code || "");

  useEffect(() => {
    if (stream && audioRef.current) {
      audioRef.current.srcObject = stream;
      if (isPlaying) {
        audioRef.current.play().catch(e => {
          console.error("Autoplay prevented:", e);
          setIsPlaying(false);
        });
      }
    }
  }, [stream]);

  const togglePlay = () => {
    if (!audioRef.current || !stream) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(e => console.error("Play failed:", e));
    }
  };

  if (isLoadingRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Room not found</AlertTitle>
          <AlertDescription>This broadcast doesn't exist or has ended.</AlertDescription>
          <Button onClick={() => setLocation("/")} className="mt-4 w-full" variant="outline">Return Home</Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur px-6 py-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-md">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight leading-none">{room.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">Host: {room.hostName}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <ConnectionStatus state={connectionState} />
          <div className="flex items-center gap-2 font-mono text-sm bg-card px-3 py-1.5 rounded-md border border-border">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold">{listenerCount}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 sm:p-6 max-w-4xl flex flex-col justify-center">
        
        {signalingError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{signalingError}</AlertDescription>
          </Alert>
        )}

        {connectionState === "ended" && (
          <Alert className="mb-6 border-primary/50 bg-primary/5">
            <Radio className="h-4 w-4 text-primary" />
            <AlertTitle>Broadcast Ended</AlertTitle>
            <AlertDescription>The host has ended this session.</AlertDescription>
          </Alert>
        )}

        <Card className="border-border/50 bg-card/30 backdrop-blur overflow-hidden">
          <div className="aspect-video sm:aspect-[21/9] bg-black relative border-b border-border/50">
            {stream ? (
              <AudioVisualizer stream={stream} isPlaying={isPlaying} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30 font-mono">
                <Loader2 className="h-16 w-16 mb-4 animate-spin opacity-50" />
                WAITING FOR SIGNAL...
              </div>
            )}
            
            {/* Overlay Play Button if stream exists but not playing */}
            {stream && !isPlaying && connectionState === "live" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                <Button 
                  size="icon" 
                  className="h-24 w-24 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_50px_-10px_hsl(var(--primary))]"
                  onClick={togglePlay}
                  data-testid="button-play-overlay"
                >
                  <Play className="h-10 w-10 ml-2" />
                </Button>
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 justify-between bg-card/50">
            <div className="flex-1 w-full flex justify-center sm:justify-start">
              <Button 
                size="icon"
                variant={isPlaying ? "outline" : "default"}
                className={`h-20 w-20 sm:h-24 sm:w-24 rounded-full transition-all ${!isPlaying && stream ? 'shadow-[0_0_30px_-5px_hsl(var(--primary))]' : ''}`}
                onClick={togglePlay}
                disabled={!stream || connectionState !== "live"}
                data-testid="button-transport-play"
              >
                {isPlaying ? <Pause className="h-8 w-8 sm:h-10 sm:w-10" /> : <Play className="h-8 w-8 sm:h-10 sm:w-10 ml-2" />}
              </Button>
            </div>
            
            <div className="flex flex-col items-center sm:items-end font-mono text-sm space-y-2">
              <div className="text-muted-foreground uppercase tracking-widest text-xs font-bold">Signal Quality</div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${stream ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-muted'}`} />
                <span className={stream ? "text-foreground" : "text-muted-foreground"}>{stream ? "EXCELLENT" : "NONE"}</span>
              </div>
              <div className="text-muted-foreground text-xs mt-2">
                CODEC: OPUS 48kHz
              </div>
            </div>
          </div>
        </Card>

        {/* Hidden audio element to actually play the WebRTC stream */}
        <audio ref={audioRef} autoPlay={false} style={{ display: 'none' }} />
      </main>
    </div>
  );
}
