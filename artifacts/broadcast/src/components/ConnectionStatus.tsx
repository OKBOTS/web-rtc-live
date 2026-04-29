import React from "react";
import { ConnectionState } from "../hooks/useWebRTCListener";

export function ConnectionStatus({ state }: { state: ConnectionState | "live" | "preparing" }) {
  const getProps = () => {
    switch (state) {
      case "live":
        return { label: "LIVE", color: "bg-destructive", pulse: true };
      case "connecting":
        return { label: "CONNECTING", color: "bg-primary", pulse: true };
      case "disconnected":
        return { label: "DISCONNECTED", color: "bg-muted-foreground", pulse: false };
      case "ended":
        return { label: "ENDED", color: "bg-muted-foreground", pulse: false };
      case "preparing":
        return { label: "PREPARING", color: "bg-primary", pulse: true };
      default:
        return { label: "UNKNOWN", color: "bg-muted", pulse: false };
    }
  };

  const { label, color, pulse } = getProps();

  return (
    <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest">
      <div className="relative flex h-3 w-3 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`}
          ></span>
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`}></span>
      </div>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
