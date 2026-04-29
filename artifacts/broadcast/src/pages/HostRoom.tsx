import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useGetRoom, useEndRoom } from "@workspace/api-client-react";
import { useWebRTCHost } from "@/hooks/useWebRTCHost";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, AlertCircle, Mic2, Globe, Users, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function HostRoom() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const { data: room, isLoading: isLoadingRoom } = useGetRoom(code || "", { 
    query: { enabled: !!code } 
  });
  
  const endRoom = useEndRoom();

  useEffect(() => {
    if (code) {
      const token = sessionStorage.getItem(`airwave:host:${code}`);
      setHostToken(token);
    }
  }, [code]);

  const { listenerCount, error: signalingError } = useWebRTCHost(code || "", hostToken || "", stream);

  const shareUrl = `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/listen/${code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Share this link with your listeners.",
    });
  };

  const startCapture = async () => {
    if (!room) return;
    setIsCapturing(true);
    setStreamError(null);

    try {
      let mediaStream: MediaStream;
      if (room.sourceType === "tab") {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true, 
          audio: true 
        });
        
        // Check if audio was actually shared
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
          mediaStream.getTracks().forEach(t => t.stop());
          throw new Error("No audio track found. Please make sure to check 'Share tab audio' in the share dialog.");
        }
        
        // We only want audio, drop video
        mediaStream.getVideoTracks().forEach(t => t.stop());
        
      } else {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, 
          video: false 
        });
      }
      
      setStream(mediaStream);
      
      // Listen for stream stop (user clicks "Stop sharing" in browser UI)
      mediaStream.getTracks()[0].onended = () => {
        handleEndBroadcast();
      };
      
    } catch (err: any) {
      console.error("Capture error:", err);
      setStreamError(err.message || "Failed to capture audio source.");
      setIsCapturing(false);
    }
  };

  const handleEndBroadcast = async () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    
    if (code && hostToken) {
      try {
        await endRoom.mutateAsync({ code, data: { hostToken } });
        sessionStorage.removeItem(`airwave:host:${code}`);
      } catch (e) {
        console.error("Failed to end room", e);
      }
    }
    
    setLocation("/");
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

  if (!hostToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Authorized</AlertTitle>
          <AlertDescription>You are not the host of this room. Are you trying to listen instead?</AlertDescription>
          <Button asChild className="mt-4 w-full" variant="outline">
            <Link href={`/listen/${code}`}>Go to Listener Page</Link>
          </Button>
        </Alert>
      </div>
    );
  }

  const isLive = !!stream;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{room.title}</h1>
          <p className="text-sm text-muted-foreground">Host: {room.hostName}</p>
        </div>
        <div className="flex items-center gap-6">
          <ConnectionStatus state={isLive ? "live" : "preparing"} />
          <div className="flex items-center gap-2 font-mono text-sm bg-card px-3 py-1.5 rounded-md border border-border">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold">{listenerCount}</span>
          </div>
          {isLive && (
            <Button 
              variant="destructive" 
              onClick={handleEndBroadcast}
              className="font-bold shadow-[0_0_20px_-5px_hsl(var(--destructive))]"
              data-testid="button-end-broadcast"
            >
              <Square className="mr-2 h-4 w-4 fill-current" />
              END BROADCAST
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Monitor */}
          <Card className="overflow-hidden border-border/50 bg-black/50 aspect-video relative flex flex-col justify-end p-6 ring-1 ring-white/5">
            <div className="absolute inset-0 z-0">
              {stream ? (
                <AudioVisualizer stream={stream} isPlaying={true} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30 font-mono">
                  <Activity className="h-24 w-24 mb-4" />
                  NO SIGNAL
                </div>
              )}
            </div>
            
            <div className="relative z-10 flex justify-between items-end">
              <div className="bg-background/80 backdrop-blur-md px-3 py-1.5 rounded text-xs font-mono font-bold tracking-widest text-muted-foreground border border-border/50 flex items-center gap-2">
                {room.sourceType === "tab" ? <Globe className="h-3 w-3" /> : <Mic2 className="h-3 w-3" />}
                {room.sourceType === "tab" ? "TAB AUDIO" : "MIC INPUT"}
              </div>
            </div>
          </Card>

          {!isLive && (
            <Card className="border-primary/30 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">Studio Ready</h2>
              {room.sourceType === "tab" ? (
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  When you click Go Live, your browser will ask what to share. 
                  <strong className="text-foreground block mt-2">IMPORTANT: Choose a tab and ensure "Share tab audio" is checked.</strong>
                </p>
              ) : (
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Click Go Live to start capturing your microphone and broadcasting to the room.
                </p>
              )}
              
              {streamError && (
                <Alert variant="destructive" className="mb-6 max-w-md mx-auto text-left">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Capture Error</AlertTitle>
                  <AlertDescription>{streamError}</AlertDescription>
                </Alert>
              )}
              
              <Button 
                size="lg" 
                onClick={startCapture} 
                disabled={isCapturing}
                className="h-16 px-12 text-xl font-bold shadow-[0_0_40px_-10px_hsl(var(--primary))]"
                data-testid="button-go-live"
              >
                {isCapturing ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> INITIALIZING...</> : "GO LIVE"}
              </Button>
            </Card>
          )}

          {signalingError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{signalingError}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-border/50">
            <h3 className="font-bold text-sm tracking-widest uppercase text-muted-foreground mb-4">Share Link</h3>
            <div className="flex gap-2 mb-6">
              <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono truncate border border-border/50">
                {shareUrl}
              </div>
              <Button variant="secondary" size="icon" onClick={copyLink} data-testid="button-copy-link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <QRCodeDisplay url={shareUrl} />
            </div>
          </Card>
          
          <Card className="p-6 border-border/50 bg-card/50">
            <h3 className="font-bold text-sm tracking-widest uppercase text-muted-foreground mb-4">Session Stats</h3>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="text-muted-foreground">ROOM CODE</span>
                <span className="font-bold">{code}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="text-muted-foreground">LISTENERS</span>
                <span className="font-bold text-primary">{listenerCount}</span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-muted-foreground">STATUS</span>
                <span className={`font-bold ${isLive ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {isLive ? 'TRANSMITTING' : 'IDLE'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

// Dummy Activity component since it wasn't imported from lucide-react above
function Activity(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.48 12H2"/></svg>;
}
