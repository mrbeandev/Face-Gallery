import { useEffect, useRef } from "react";
import type { WSEvent } from "../types";
import { useJobStore } from "../store/jobStore";
import { useSettingsStore } from "../store/settingsStore";

export function useJobWS(jobId: string | null) {
  const handleWSEvent = useJobStore((s) => s.handleWSEvent);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const connect = () => {
      const wsBase = useSettingsStore.getState().wsBase();
      const ws = new WebSocket(`${wsBase}/ws/${jobId}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as WSEvent;
          handleWSEvent(evt);
        } catch {}
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        wsRef.current = null;
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [jobId, handleWSEvent]);
}
