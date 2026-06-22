// ============================================================
// tracing.ts — OpenTelemetry tracing for the Layer-3 pipeline.
//
// No-op by default (zero overhead, no noise). Enable by setting:
//   • OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318/v1/traces  → OTLP export
//   • OTEL_CONSOLE=true                                            → console spans
//
// `withSpan` is always safe to call: when tracing is off it runs against the
// API's no-op tracer, so the pipeline code is instrumented unconditionally.
// ============================================================

import { trace, type Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

const SERVICE = "layer-3-stm";
let started = false;

export function initTracing(): void {
  if (started) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const useConsole = process.env.OTEL_CONSOLE === "true";
  if (!endpoint && !useConsole) return; // disabled — stays a no-op tracer

  const exporter = endpoint ? new OTLPTraceExporter() : new ConsoleSpanExporter();
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": SERVICE }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
  started = true;
  console.log(`[otel] tracing enabled (${endpoint ? `OTLP → ${endpoint}` : "console"})`);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(SERVICE);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
