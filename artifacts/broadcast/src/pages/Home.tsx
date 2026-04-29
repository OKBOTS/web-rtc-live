import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListRooms, useGetStats } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mic2, Radio, Activity, Users, ArrowRight, Play, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const [, setLocation] = useLocation();
  const [joinCode, setJoinCode] = useState("");

  const { data: stats } = useGetStats({ query: { refetchInterval: 5000 } });
  const { data: rooms, isLoading: isLoadingRooms } = useListRooms({ query: { refetchInterval: 5000 } });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    
    // Extract code if it's a full URL
    let code = joinCode.trim();
    try {
      const url = new URL(code);
      const parts = url.pathname.split('/');
      code = parts[parts.length - 1];
    } catch {
      // Not a URL, use as is
    }
    
    setLocation(`/listen/${code}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-2 font-mono text-xl font-bold tracking-tighter text-primary">
            <Radio className="h-6 w-6" />
            AIRWAVE
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
              </span>
              {stats?.liveNow || 0} LIVE
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {stats?.listenersConnected || 0} LISTENING
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative py-24 lg:py-32 overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-[url('/hero.png')] bg-cover bg-center opacity-20 mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          
          <div className="container relative mx-auto px-4 text-center">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8 backdrop-blur-sm">
              <Activity className="mr-2 h-4 w-4" />
              Lossless WebRTC Audio Broadcasting
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 max-w-4xl mx-auto leading-tight">
              Your personal radio station in <span className="text-primary">5 seconds.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Share high-fidelity browser audio or your microphone live. No logins, no downloads, just pure signal.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
              <Button asChild size="lg" className="w-full sm:w-auto h-14 px-8 text-lg font-bold shadow-[0_0_40px_-10px_hsl(var(--primary))] hover:shadow-[0_0_60px_-15px_hsl(var(--primary))] transition-all">
                <Link href="/host" data-testid="link-start-broadcasting">
                  <Mic2 className="mr-2 h-5 w-5" />
                  Start Broadcasting
                </Link>
              </Button>
              
              <div className="text-muted-foreground font-mono text-sm font-bold">OR</div>
              
              <form onSubmit={handleJoin} className="flex w-full sm:w-auto h-14 bg-background rounded-md border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all overflow-hidden">
                <Input 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Paste link or code" 
                  className="border-0 focus-visible:ring-0 h-full rounded-none bg-transparent"
                  data-testid="input-join-code"
                />
                <Button type="submit" variant="ghost" className="h-full rounded-none px-6 hover:bg-primary/20 hover:text-primary" data-testid="button-join">
                  Join <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </section>

        {/* Live Broadcasts Section */}
        <section className="py-24 container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Live on Airwave</h2>
              <p className="text-muted-foreground">Join a public broadcast happening right now.</p>
            </div>
          </div>

          {isLoadingRooms ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-xl" />
              ))}
            </div>
          ) : rooms?.length === 0 ? (
            <div className="text-center py-24 border border-dashed border-border/50 rounded-xl bg-card/30">
              <Radio className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-bold mb-2">Dead Air</h3>
              <p className="text-muted-foreground mb-6">No one is broadcasting right now. Be the first.</p>
              <Button asChild variant="outline">
                <Link href="/host">Start Broadcasting</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rooms?.map((room) => (
                <Link key={room.code} href={`/listen/${room.code}`}>
                  <Card className="group hover:border-primary/50 transition-colors cursor-pointer bg-card/50 hover:bg-card overflow-hidden">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className={`px-2 py-1 rounded text-xs font-bold font-mono ${room.isLive ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                          {room.isLive ? 'LIVE' : 'ENDED'}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground font-mono">
                          <Users className="mr-1 h-3 w-3" />
                          {room.listenerCount}
                        </div>
                      </div>
                      <CardTitle className="text-xl line-clamp-1 group-hover:text-primary transition-colors">{room.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span>by {room.hostName}</span>
                        <span className="text-border">•</span>
                        <span>{formatDistanceToNow(new Date(room.createdAt))} ago</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 p-3 rounded-md border border-border/50 font-mono">
                        {room.sourceType === "tab" ? <Globe className="h-4 w-4" /> : <Mic2 className="h-4 w-4" />}
                        {room.sourceType === "tab" ? "System Audio" : "Microphone"}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
