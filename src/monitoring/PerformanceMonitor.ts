/**
 * Performance Monitoring for DEX Operations
 * 
 * Tracks latency, throughput, and performance metrics across
 * all storage tiers to ensure we meet performance requirements.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface PerformanceMetrics {
  operation: string;
  storageType: 'hot' | 'warm' | 'cold' | 'hybrid';
  latency: number; // milliseconds
  success: boolean;
  timestamp: number;
  metadata?: any;
}

export interface AggregatedMetrics {
  operation: string;
  count: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
  throughput: number; // operations per second
}

export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = [];
  private maxMetricsSize = 10000;
  private aggregationInterval = 60000; // 1 minute
  private aggregationTimer?: NodeJS.Timer;

  constructor() {
    super();
    this.startAggregation();
  }

  /**
   * Record a performance metric
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
   * Time an async operation
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
   */
  getStats(operation?: string, timeWindow?: number): AggregatedMetrics[] {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    // Filter metrics
    let filteredMetrics = this.metrics.filter(m => m.timestamp >= windowStart);
    if (operation) {
      filteredMetrics = filteredMetrics.filter(m => m.operation === operation);
    }
    
    // Group by operation
    const grouped = new Map<string, PerformanceMetrics[]>();
    for (const metric of filteredMetrics) {
      const key = metric.operation;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }
    
    // Calculate aggregated metrics
    const results: AggregatedMetrics[] = [];
    for (const [op, metrics] of grouped) {
      const latencies = metrics.map(m => m.latency).sort((a, b) => a - b);
      const successCount = metrics.filter(m => m.success).length;
      
      const timeSpan = (metrics[metrics.length - 1].timestamp - metrics[0].timestamp) / 1000 || 1;
      
      results.push({
        operation: op,
        count: metrics.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        minLatency: latencies[0] || 0,
        maxLatency: latencies[latencies.length - 1] || 0,
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
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
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
   * Get performance report
   */
  getPerformanceReport(): any {
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
      summary: {
        totalOperations: this.metrics.length,
        timeWindow: this.metrics.length > 0 ? 
          (Date.now() - this.metrics[0].timestamp) / 1000 : 0,
        operations: allStats
      },
      storageTypes: Object.fromEntries(storageStats),
      recommendations: this.getRecommendations(allStats)
    };
  }

  /**
   * Get performance recommendations
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
   * Export metrics for analysis
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
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
    this.removeAllListeners();
    logger.info('Performance monitor shutdown');
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();