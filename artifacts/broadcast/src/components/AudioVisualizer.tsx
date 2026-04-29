import React, { useEffect, useRef } from "react";

export function AudioVisualizer({ stream, isPlaying = true }: { stream: MediaStream | null; isPlaying?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !canvasRef.current || !isPlaying) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Resume context if suspended
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    const audioCtx = audioCtxRef.current;
    
    // Clean up old analyzer
    if (analyzerRef.current) {
        analyzerRef.current.disconnect();
    }
    
    const source = audioCtx.createMediaStreamSource(stream);
    const analyzer = audioCtx.createAnalyser();
    analyzer.fftSize = 128;
    analyzer.smoothingTimeConstant = 0.8;
    source.connect(analyzer);
    analyzerRef.current = analyzer;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);

      analyzer.getByteFrequencyData(dataArray);

      ctx.fillStyle = "#09090b"; // match bg
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        
        // Amber primary color with opacity
        const primaryColor = `rgba(245, 158, 11, ${Math.max(0.2, barHeight / 128)})`;
        ctx.fillStyle = primaryColor;
        
        // Draw centered vertically
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 2;
      }
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationRef.current);
      source.disconnect();
      analyzer.disconnect();
    };
  }, [stream, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-md object-cover bg-background"
      width={600}
      height={150}
    />
  );
}
