import React, { useState } from "react";
import { useLocation } from "wouter";
import { useCreateRoom } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Globe, Mic2, Radio, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function HostSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [sourceType, setSourceType] = useState<"tab" | "mic">("tab");

  const createRoom = useCreateRoom({
    mutation: {
      onSuccess: (data) => {
        // Store host token
        sessionStorage.setItem(`airwave:host:${data.room.code}`, data.hostToken);
        setLocation(`/host/${data.room.code}`);
      },
      onError: (error: any) => {
        toast({
          title: "Failed to create room",
          description: error.message || "An unexpected error occurred",
          variant: "destructive",
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hostName.trim()) return;
    
    createRoom.mutate({
      data: {
        title: title.trim(),
        hostName: hostName.trim(),
        sourceType
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 p-4">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="space-y-4 pb-8">
            <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
              <Radio className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <CardTitle className="text-2xl font-bold tracking-tight">Configure Broadcast</CardTitle>
              <CardDescription>Set up your studio before going live.</CardDescription>
            </div>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Broadcast Title</Label>
                <Input 
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Late Night Synthwave Mix"
                  className="h-12 text-lg bg-background/50 border-border/50 focus-visible:border-primary"
                  maxLength={80}
                  required
                  data-testid="input-room-title"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="hostName" className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Host Name</Label>
                <Input 
                  id="hostName"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. DJ Matrix"
                  className="h-12 text-lg bg-background/50 border-border/50 focus-visible:border-primary"
                  maxLength={40}
                  required
                  data-testid="input-host-name"
                />
              </div>

              <div className="space-y-3 pt-4">
                <Label className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Audio Source</Label>
                <RadioGroup value={sourceType} onValueChange={(v) => setSourceType(v as "tab" | "mic")} className="grid grid-cols-2 gap-4">
                  <div>
                    <RadioGroupItem value="tab" id="tab" className="peer sr-only" />
                    <Label
                      htmlFor="tab"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <Globe className="mb-3 h-6 w-6" />
                      <span className="font-semibold">Tab Audio</span>
                      <span className="text-xs text-muted-foreground mt-1 text-center">Share browser audio</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="mic" id="mic" className="peer sr-only" />
                    <Label
                      htmlFor="mic"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <Mic2 className="mb-3 h-6 w-6" />
                      <span className="font-semibold">Microphone</span>
                      <span className="text-xs text-muted-foreground mt-1 text-center">Voice broadcast</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
            
            <CardFooter className="pt-6">
              <Button 
                type="submit" 
                className="w-full h-14 text-lg font-bold shadow-[0_0_30px_-10px_hsl(var(--primary))] hover:shadow-[0_0_50px_-10px_hsl(var(--primary))] transition-all"
                disabled={createRoom.isPending || !title.trim() || !hostName.trim()}
                data-testid="button-create-room"
              >
                {createRoom.isPending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing Studio...</>
                ) : (
                  "Create Room & Prepare"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
