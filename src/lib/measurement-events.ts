"use client";
/**
 * measurement-events.ts - one /api/events stream per page, shared by
 * everything that listens (the survey provider and the floor plan), so a
 * few open tabs don't use up the browser's connections to the server.
 * The stream opens with the first listener and closes with the last;
 * EventSource reconnects by itself if it drops.
 */
import type { MeasurementEvent } from "./types";

type Listener = (event: MeasurementEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

export function onMeasurementEvent(listener: Listener): () => void {
  listeners.add(listener);
  if (!source && typeof EventSource !== "undefined") {
    source = new EventSource("/api/events");
    source.onmessage = (message: MessageEvent) => {
      let event: MeasurementEvent;
      try {
        event = JSON.parse(message.data) as MeasurementEvent;
      } catch {
        return; // not one of ours
      }
      for (const l of [...listeners]) l(event);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}
