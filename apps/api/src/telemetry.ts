import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
export function startTelemetry() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!endpoint) return undefined;
  const sdk = new NodeSDK({
    serviceName: 'tax-intelligence-api',
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
  });
  sdk.start();
  return sdk;
}
