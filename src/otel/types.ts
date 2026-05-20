import type { CoreNamespace, LogId, XOR } from '../types.js'

/**
 * OTel config (OtelConfig, OtelExporterConfig, OtelSignalConfig) lives on CoreConfig.logging.otel
 * in ../types.ts to avoid circular imports. Import from '@node-in-layers/core' when you need it.
 */

/** Status code and optional message for a span (e.g. OK, ERROR). */
export type SpanStatus = Readonly<{ code: number; message?: string }>

/** Single attribute value allowed in OTel attributes. */
export type AttributeValue = string | number | boolean

/** Map of attribute names to values (used in spans, metrics, etc.). */
export type AttributesMap = Readonly<Record<string, AttributeValue>>

/**
 * An object that can be adapted into a {@link SpanLike} (e.g. a raw span from the OTel API).
 * @interface
 */
export type SpanWrappable = Readonly<{
  /** Ends the span. */
  end: () => void
  /**
   * Sets a single attribute on the span.
   * @param key - The attribute name.
   * @param value - The attribute value.
   */
  setAttribute: (key: string, value: AttributeValue) => void
  /**
   * Sets the status of the span.
   * @param status - The {@link SpanStatus} to apply.
   */
  setStatus: (status: SpanStatus) => void
}>

/**
 * An abstraction over an OpenTelemetry span used within the system.
 * @interface
 */
export type SpanLike = Readonly<{
  /** Ends the span and records its duration. */
  end: () => void
  /**
   * Sets a single attribute on the span.
   * @param key - The attribute name.
   * @param value - The attribute value.
   */
  setAttribute: (key: string, value: AttributeValue) => void
  /**
   * Sets the status of the span.
   * @param status - The {@link SpanStatus} to apply.
   */
  setStatus: (status: SpanStatus) => void
}>

/**
 * An abstraction over an OpenTelemetry histogram instrument.
 * @interface
 */
export type HistogramLike = Readonly<{
  /**
   * Records a single measurement.
   * @param value - The numeric value to record.
   * @param attributes - Optional {@link AttributesMap} to associate with the measurement.
   */
  record: (value: number, attributes?: AttributesMap) => void
}>

/**
 * An abstraction over an OpenTelemetry counter instrument.
 * @interface
 */
export type CounterLike = Readonly<{
  /**
   * Increments the counter.
   * @param value - The amount to add (defaults to 1).
   * @param attributes - Optional {@link AttributesMap} to associate with the measurement.
   */
  add: (value?: number, attributes?: AttributesMap) => void
}>

/**
 * Service for creating and managing OpenTelemetry trace spans.
 * @interface
 */
export type OtelTraceService = Readonly<{
  /**
   * Starts a new span with the given name.
   * @param name - The span name.
   * @param options - Optional initial attributes.
   */
  startSpan: (
    name: string,
    options?: { attributes?: AttributesMap }
  ) => SpanLike
  /**
   * Runs a function within a new span, automatically ending the span when done.
   * @param name - The span name.
   * @param fn - The function to execute; receives the active {@link SpanLike}.
   * @param options - Optional initial attributes.
   */
  runWithSpan: <T>(
    name: string,
    fn: (span: SpanLike) => T | Promise<T>,
    options?: { attributes?: AttributesMap }
  ) => T | Promise<T>
  /**
   * Returns the currently active span, if one exists.
   */
  getActiveSpan: () => SpanLike | undefined
}>

/**
 * Service for recording OpenTelemetry metrics (durations, counters, histograms).
 * @interface
 */
export type OtelMetricsService = Readonly<{
  /**
   * Records a duration measurement on a histogram with the given name.
   * @param name - The metric name.
   * @param durationMs - Duration in milliseconds.
   * @param attributes - Optional {@link AttributesMap} to associate with the measurement.
   */
  recordDuration: (
    name: string,
    durationMs: number,
    attributes?: AttributesMap
  ) => void
  /**
   * Increments a named counter.
   * @param name - The counter name.
   * @param value - The amount to add (defaults to 1).
   * @param attributes - Optional {@link AttributesMap} to associate with the increment.
   */
  incrementCounter: (
    name: string,
    value?: number,
    attributes?: AttributesMap
  ) => void
  /**
   * Creates a named {@link HistogramLike} for recording arbitrary measurements.
   * @param name - The histogram name.
   * @param options - Optional unit for the histogram.
   */
  createHistogram: (name: string, options?: { unit?: string }) => HistogramLike
  /**
   * Creates a named {@link CounterLike} for tracking cumulative counts.
   * @param name - The counter name.
   * @param options - Optional unit for the counter.
   */
  createCounter: (name: string, options?: { unit?: string }) => CounterLike
}>

/**
 * Service for emitting structured log records via the OpenTelemetry Logs API.
 * @interface
 */
export type OtelLogsService = Readonly<{
  /**
   * Emits a log record.
   * @param record - The log record to emit.
   * @param record.body - The log message body.
   * @param record.severityNumber - Optional OTel severity number.
   * @param record.severityText - Optional human-readable severity label.
   * @param record.attributes - Optional key/value attributes.
   */
  emit: (record: {
    body: string
    severityNumber?: number
    severityText?: string
    attributes?: Record<string, unknown>
  }) => void
}>

/**
 * Options for {@link OtelServices.runWithTraceAndMetrics}: provides layer/function identity
 * and log ids for span attributes.
 * @interface
 */
export type RunWithTraceAndMetricsOptions = Readonly<{
  /**
   * The name of the layer the function belongs to.
   */
  layerName: string
  /**
   * The name of the domain the function belongs to.
   */
  domain: string
  /**
   * The name of the function being traced.
   */
  functionName: string
  /**
   * Returns the current {@link LogId} stack for inclusion as span attributes.
   */
  getIds: () => readonly LogId[]
}>

/**
 * The complete OpenTelemetry services bundle exposed on the context.
 * Provides tracing, metrics, and log emission in a framework-agnostic way.
 * @interface
 */
export type OtelServices = Readonly<{
  /**
   * One-time setup for OTel providers and exporters. May be async.
   * Called automatically by the system loader when the otel domain is present.
   */
  setupOtel: () => XOR<void, Promise<void>>
  /**
   * Tracing service for creating and managing spans. See {@link OtelTraceService}.
   */
  trace: OtelTraceService
  /**
   * Metrics service for recording durations and counters. See {@link OtelMetricsService}.
   */
  metrics: OtelMetricsService
  /**
   * Logs service for emitting structured log records via OTel. See {@link OtelLogsService}.
   */
  logs: OtelLogsService
  /**
   * Runs a function within a span and records its duration as a metric.
   * Uses {@link RunWithTraceAndMetricsOptions} to name the span and attach log ids as attributes.
   * @param options - Identity and tracing context for the operation.
   * @param fn - The function to wrap.
   */
  runWithTraceAndMetrics: <T>(
    options: RunWithTraceAndMetricsOptions,
    fn: () => T | Promise<T>
  ) => T | Promise<T>
}>

/**
 * The services layer shape for the otel domain, used to type the context's services object.
 * @interface
 */
export type OtelServicesLayer = Readonly<{
  /**
   * The {@link OtelServices} instance registered under the {@link CoreNamespace.otel} namespace.
   */
  [CoreNamespace.otel]: OtelServices
}>
