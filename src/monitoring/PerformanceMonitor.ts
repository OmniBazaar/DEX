/**
 * Performance Monitoring for DEX Operations
 * 
 * Tracks latency, throughput, and performance metrics across
 * all storage tiers to ensure we meet performance requirements.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * Performance metrics for individual operations
 */
export interface PerformanceMetrics {
  /** Operation identifier */
  operation: string;
  /** Storage tier used for the operation */
  storageType: 'hot' | 'warm' | 'cold' | 'hybrid';
  /** Operation latency in milliseconds */
  latency: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Timestamp when the operation completed */
  timestamp: number;
  /** Optional metadata about the operation */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated performance metrics for analysis
 */
export interface AggregatedMetrics {
  /** Operation identifier */
  operation: string;
  /** Total number of operations */
  count: number;
  /** Average latency in milliseconds */
  avgLatency: number;
  /** Minimum latency observed */
  minLatency: number;
  /** Maximum latency observed */
  maxLatency: number;
  /** 50th percentile latency */
  p50Latency: number;
  /** 95th percentile latency */
  p95Latency: number;
  /** 99th percentile latency */
  p99Latency: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Operations per second */
  throughput: number;
}

/**
 * Comprehensive performance report
 */
export interface PerformanceReport {
  /** Report generation timestamp */
  timestamp: number;
  /** Overall performance summary */
  summary: {
    /** Total operations tracked */
    totalOperations: number;
    /** Average latency across all operations */
    avgLatency: number;
    /** Overall success rate */
    successRate: number;
    /** Total throughput */
    throughput: number;
  };
  /** Metrics grouped by storage type */
  byStorageType: Record<string, AggregatedMetrics[]>;
  /** Metrics grouped by operation type */
  byOperation: Record<string, AggregatedMetrics>;
  /** Performance improvement recommendations */
  recommendations: string[];
}

/**
 * Performance monitoring system for DEX operations
 * Tracks latency, throughput, and success rates across storage tiers
 */
export class PerformanceMonitor extends EventEmitter {
  /** Array of performance metrics */
  private metrics: PerformanceMetrics[] = [];
  /** Maximum number of metrics to keep in memory */
  private maxMetricsSize = 10000;
  /** Interval for aggregating metrics (1 minute) */
  private aggregationInterval = 60000;
  /** Timer for periodic aggregation */
  private aggregationTimer?: ReturnType<typeof setInterval>;

  /**
   * Creates a new PerformanceMonitor instance
   * Automatically starts metric aggregation
   */
  constructor() {
    super();
    this.startAggregation();
  }

  /**
   * Record a performance metric
   * @param metric - Performance metric to record
   */
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Emit real-time metric
    this.emit('metric', metric);
    
    // Check performance thresholds
    this.checkThresholds(metric);
    
    // Maintain sliding window
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics.shift();
    }
  }

  /**
   * Time an async operation and record its performance metrics
   * @param operation - Operation identifier
   * @param storageType - Storage tier being used
   * @param fn - Async function to time
   * @returns Result of the timed operation
   */
  async timeOperation<T>(
    operation: string,
    storageType: 'hot' | 'warm' | 'cold' | 'hybrid',
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const latency = Date.now() - startTime;
      this.recordMetric({
        operation,
        storageType,
        latency,
        success,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get current performance statistics
   * @param operation - Optional operation filter
   * @param timeWindow - Optional time window in milliseconds
   * @returns Array of aggregated metrics
   */
  getStats(operation?: string, timeWindow?: number): AggregatedMetrics[] {
    const now = Date.now();
    const windowStart = (typeof timeWindow === 'number' && timeWindow > 0) ? now - timeWindow : 0;
    
    // Filter metrics
    let filteredMetrics = this.metrics.filter(m => m.timestamp >= windowStart);
    if (typeof operation === 'string' && operation.length > 0) {
      filteredMetrics = filteredMetrics.filter(m => m.operation === operation);
    }
    
    // Group by operation
    const grouped = new Map<string, PerformanceMetrics[]>();
    for (const metric of filteredMetrics) {
      const key = metric.operation;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      const group = grouped.get(key);
      if (group !== undefined) {
        group.push(metric);
      }
    }
    
    // Calculate aggregated metrics
    const results: AggregatedMetrics[] = [];
    for (const [op, metrics] of grouped) {
      const latencies = metrics.map(m => m.latency).sort((a, b) => a - b);
      const successCount = metrics.filter(m => m.success).length;
      
      const lastMetric = metrics[metrics.length - 1];
      const firstMetric = metrics[0];
      const timeDiff = (lastMetric !== undefined && firstMetric !== undefined) ? (lastMetric.timestamp - firstMetric.timestamp) / 1000 : 0;
      const timeSpan = timeDiff > 0 ? timeDiff : 1;
      
      results.push({
        operation: op,
        count: metrics.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        minLatency: latencies[0] ?? 0,
        maxLatency: (latencies.length > 0 ? latencies[latencies.length - 1] : undefined) ?? 0,
        p50Latency: this.percentile(latencies, 0.5),
        p95Latency: this.percentile(latencies, 0.95),
        p99Latency: this.percentile(latencies, 0.99),
        successRate: successCount / metrics.length,
        throughput: metrics.length / timeSpan
      });
    }
    
    return results;
  }

  /**
   * Check performance thresholds and emit warnings
   * @param metric - Performance metric to check
   */
  private checkThresholds(metric: PerformanceMetrics): void {
    const thresholds = {
      hot: 10,      // 10ms for hot storage
      warm: 100,    // 100ms for warm storage
      cold: 1000,   // 1000ms for cold storage
      hybrid: 50    // 50ms for hybrid operations
    };
    
    const threshold = thresholds[metric.storageType];
    if (metric.latency > threshold) {
      logger.warn(`Performance threshold exceeded`, {
        operation: metric.operation,
        storageType: metric.storageType,
        latency: metric.latency,
        threshold
      });
      
      this.emit('threshold-exceeded', {
        metric,
        threshold
      });
    }
    
    // Critical performance issue
    if (metric.latency > threshold * 3) {
      logger.error(`Critical performance issue`, {
        operation: metric.operation,
        storageType: metric.storageType,
        latency: metric.latency,
        threshold
      });
      
      this.emit('critical-performance', {
        metric,
        threshold
      });
    }
  }

  /**
   * Calculate percentile from sorted array
   * @param sortedArray - Array of values sorted in ascending order
   * @param p - Percentile to calculate (0-1)
   * @returns Percentile value
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * p) - 1;
    const value = sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    return value ?? 0;
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      const stats = this.getStats(undefined, this.aggregationInterval);
      
      for (const stat of stats) {
        logger.info('Performance stats', {
          operation: stat.operation,
          count: stat.count,
          avgLatency: stat.avgLatency.toFixed(2) + 'ms',
          p95Latency: stat.p95Latency.toFixed(2) + 'ms',
          successRate: (stat.successRate * 100).toFixed(2) + '%',
          throughput: stat.throughput.toFixed(2) + ' ops/s'
        });
      }
      
      this.emit('aggregated-stats', stats);
    }, this.aggregationInterval);
  }

  /**
   * Get comprehensive performance report
   * @returns Complete performance report with metrics and recommendations
   */
  getPerformanceReport(): PerformanceReport {
    const allStats = this.getStats();
    const storageStats = new Map<string, AggregatedMetrics[]>();
    
    // Group by storage type
    for (const metric of this.metrics) {
      const key = metric.storageType;
      if (!storageStats.has(key)) {
        storageStats.set(key, []);
      }
    }
    
    return {
      timestamp: Date.now(),
      summary: {
        totalOperations: this.metrics.length,
        avgLatency: (allStats.length > 0 ? allStats.reduce((sum, stat) => sum + stat.avgLatency, 0) / allStats.length : 0),
        successRate: (allStats.length > 0 ? allStats.reduce((sum, stat) => sum + stat.successRate, 0) / allStats.length : 0),
        throughput: allStats.reduce((sum, stat) => sum + stat.throughput, 0)
      },
      byStorageType: Object.fromEntries(storageStats),
      byOperation: Object.fromEntries(allStats.map(stat => [stat.operation, stat])),
      recommendations: this.getRecommendations(allStats)
    };
  }

  /**
   * Get performance recommendations based on metrics
   * @param stats - Array of aggregated metrics to analyze
   * @returns Array of recommendation strings
   */
  private getRecommendations(stats: AggregatedMetrics[]): string[] {
    const recommendations: string[] = [];
    
    for (const stat of stats) {
      // High latency operations
      if (stat.avgLatency > 100) {
        recommendations.push(
          `Consider optimizing ${stat.operation} - average latency ${stat.avgLatency.toFixed(0)}ms`
        );
      }
      
      // Low success rate
      if (stat.successRate < 0.95) {
        recommendations.push(
          `Investigate failures in ${stat.operation} - success rate ${(stat.successRate * 100).toFixed(0)}%`
        );
      }
      
      // High variance
      if (stat.maxLatency > stat.avgLatency * 10) {
        recommendations.push(
          `High latency variance in ${stat.operation} - investigate outliers`
        );
      }
    }
    
    return recommendations;
  }

  /**
   * Export all metrics for external analysis
   * @returns Copy of all performance metrics
   */
  exportMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    logger.info('Performance metrics cleared');
  }

  /**
   * Shutdown monitor
   */
  shutdown(): void {
    if (this.aggregationTimer !== undefined) {
      clearInterval(this.aggregationTimer);
    }
    this.removeAllListeners();
    logger.info('Performance monitor shutdown');
  }
}

/**
 * Singleton performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();