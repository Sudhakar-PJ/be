import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const isTestEnv = process.env.NODE_ENV === "test";
const isTracingDisabled = process.env.OTEL_TRACING_ENABLED === "false";

// 1. Configure the OTLP/HTTP Trace Exporter (Targets Grafana Tempo in Docker Stack)
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
});

// 2. Initialize the OpenTelemetry Node SDK with standard Resource attributes
export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "saas-api",
    [ATTR_SERVICE_VERSION]: "0.1.0",
    "deployment.environment": process.env.NODE_ENV ?? "development",
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy filesystem and DNS spans to prevent trace bloat
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },

      // Core backend infrastructure instrumentations
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-express": { enabled: true },
      "@opentelemetry/instrumentation-pg": { enabled: true },
      "@opentelemetry/instrumentation-ioredis": { enabled: true },
      "@opentelemetry/instrumentation-pino": { enabled: true },
    }),
  ],
});

// 3. Start tracing (bypassed in test environments to keep test suites fast)
if (!isTestEnv && !isTracingDisabled) {
  otelSdk.start();
}

/**
 * Graceful shutdown helper to flush buffered spans to Tempo/OTLP before process termination.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!isTestEnv && !isTracingDisabled) {
    try {
      await otelSdk.shutdown();
    } catch {
      // Ignore errors during exit flush
    }
  }
}
