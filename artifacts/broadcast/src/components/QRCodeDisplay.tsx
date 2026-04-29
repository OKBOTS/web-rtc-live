import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QRCodeDisplay({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#f4f4f5', // off-white
          light: '#09090b' // background
        }
      }, (error) => {
        if (error) console.error("Error generating QR code", error);
      });
    }
  }, [url]);

  return <canvas ref={canvasRef} className="rounded border border-border" />;
}
