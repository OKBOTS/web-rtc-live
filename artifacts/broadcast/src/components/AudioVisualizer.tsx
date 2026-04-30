import React, { useEffect, useRef } from "react";

export function AudioVisualizer({
  stream,
  isPlaying = true,
}: {
  stream: MediaStream | null;
  isPlaying?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!stream || !isPlaying) {
      cancelAnimationFrame(animationRef.current);
      const ctx = canvas.getContext("2d")!;
      drawIdle(ctx, canvas.width, canvas.height);
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    const audioCtx = audioCtxRef.current;

    if (analyzerRef.current) analyzerRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();

    const source = audioCtx.createMediaStreamSource(stream);
    const analyzer = audioCtx.createAnalyser();
    analyzer.fftSize = 256;
    analyzer.smoothingTimeConstant = 0.82;
    source.connect(analyzer);
    analyzerRef.current = analyzer;
    sourceRef.current = source;

    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const NUM_BARS = 72;

    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);
      const W = canvas.width;
      const H = canvas.height;

      analyzer.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(9, 9, 11, 0.88)";
      ctx.fillRect(0, 0, W, H);

      const barW = (W / NUM_BARS) - 2;
      const centerY = H / 2;

      for (let i = 0; i < NUM_BARS; i++) {
        const idx = Math.floor((i / NUM_BARS) * bufferLength * 0.75);
        const raw = dataArray[idx] ?? 0;
        const norm = raw / 255;
        const barH = Math.max(2, norm * centerY * 0.92);

        const x = i * (barW + 2);

        const r = Math.round(245 + norm * 8);
        const g = Math.round(158 - norm * 118);
        const b = 11;
        const alpha = 0.35 + norm * 0.65;

        const grad = ctx.createLinearGradient(x, centerY - barH, x, centerY + barH);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.15)`);
        grad.addColorStop(0.45, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},1)`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.15)`);

        ctx.shadowColor = `rgba(${r},${g},${b},${norm * 0.9})`;
        ctx.shadowBlur = 8 + norm * 18;
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.roundRect(x, centerY - barH, barW, barH * 2, 3);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
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
      className="w-full h-full"
      width={800}
      height={300}
    />
  );
}

function drawIdle(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  const NUM_BARS = 72;
  const barW = (W / NUM_BARS) - 2;
  const centerY = H / 2;

  for (let i = 0; i < NUM_BARS; i++) {
    const x = i * (barW + 2);
    const h = 2 + Math.sin(i * 0.4) * 2;
    ctx.fillStyle = "rgba(245,158,11,0.12)";
    ctx.beginPath();
    ctx.roundRect(x, centerY - h, barW, h * 2, 2);
    ctx.fill();
  }
}
