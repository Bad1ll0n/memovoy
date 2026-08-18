// OpenTelemetry SDK — must be the first import loaded in the process.
// Enabled only when OTEL_ENABLED=true to avoid noise in local dev.
// Set OTEL_EXPORTER_OTLP_ENDPOINT to point at your collector (default: http://localhost:4318).
// Set OTEL_SERVICE_NAME to override the service name (default: memovoy-api).

if (process.env.OTEL_ENABLED === 'true') {
  const { NodeSDK }                    = await import('@opentelemetry/sdk-node')
  const { OTLPTraceExporter }          = await import('@opentelemetry/exporter-trace-otlp-http')
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node')
  const { Resource }                   = await import('@opentelemetry/resources')
  const { SEMRESATTRS_SERVICE_NAME }   = await import('@opentelemetry/semantic-conventions')

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'memovoy-api',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise — disable filesystem instrumentation in prod
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  })

  sdk.start()
  console.info('[otel] Tracing started — service:', process.env.OTEL_SERVICE_NAME ?? 'memovoy-api')

  process.on('SIGTERM', () => sdk.shutdown().catch(console.error))
}
