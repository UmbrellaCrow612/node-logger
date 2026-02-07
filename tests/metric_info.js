/**
 * Logger Sustained Throughput Test
 * Measures how many logs can be written per second continuously
 */

const { Logger } = require('../dist');
const os = require('os');
const path = require('path');

// Test duration configurations (in seconds)
const TEST_DURATIONS = {
  burst: 1,      // 1 second burst
  short: 5,      // 5 second sustained
  medium: 10,    // 10 second sustained
  long: 30,      // 30 second sustained
};

const selectedDuration = process.argv[2] || 'short';
const TEST_DURATION_SECONDS = TEST_DURATIONS[selectedDuration] || TEST_DURATIONS.short;

class ThroughputMonitor {
  constructor(durationSeconds) {
    this.duration = durationSeconds;
    this.startTime = 0;
    this.endTime = 0;
    this.totalLogs = 0;
    this.secondIntervals = [];
    this.currentSecond = 0;
    this.logsThisSecond = 0;
    this.memorySnapshots = [];
  }

  start() {
    this.startTime = Date.now();
    this.currentSecond = 0;
    this.logsThisSecond = 0;
  }

  recordLog() {
    this.totalLogs++;
    this.logsThisSecond++;
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    const currentSecond = Math.floor(elapsed);
    
    // If we've moved to a new second, record the previous second's count
    if (currentSecond > this.currentSecond) {
      this.secondIntervals.push({
        second: this.currentSecond,
        count: this.logsThisSecond,
        timestamp: Date.now(),
      });
      
      // Record memory every second
      this.recordMemory();
      
      this.currentSecond = currentSecond;
      this.logsThisSecond = 0;
    }
  }

  recordMemory() {
    const usage = process.memoryUsage();
    this.memorySnapshots.push({
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      timestamp: Date.now(),
    });
  }

  end() {
    this.endTime = Date.now();
    
    // Record the final partial second
    if (this.logsThisSecond > 0) {
      this.secondIntervals.push({
        second: this.currentSecond,
        count: this.logsThisSecond,
        timestamp: Date.now(),
      });
    }
    
    this.recordMemory();
  }

  getTotalDuration() {
    return (this.endTime - this.startTime) / 1000;
  }

  getAverageLogsPerSecond() {
    return this.totalLogs / this.getTotalDuration();
  }

  getPeakLogsPerSecond() {
    if (this.secondIntervals.length === 0) return 0;
    return Math.max(...this.secondIntervals.map(i => i.count));
  }

  getMinLogsPerSecond() {
    if (this.secondIntervals.length === 0) return 0;
    return Math.min(...this.secondIntervals.map(i => i.count));
  }

  getMedianLogsPerSecond() {
    if (this.secondIntervals.length === 0) return 0;
    const sorted = [...this.secondIntervals.map(i => i.count)].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  getStdDev() {
    if (this.secondIntervals.length === 0) return 0;
    const counts = this.secondIntervals.map(i => i.count);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const squareDiffs = counts.map(count => Math.pow(count - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / counts.length;
    return Math.sqrt(avgSquareDiff);
  }

  getPercentile(p) {
    if (this.secondIntervals.length === 0) return 0;
    const sorted = [...this.secondIntervals.map(i => i.count)].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

function formatNumber(num) {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const sign = bytes < 0 ? '-' : '';
  return sign + value.toFixed(2) + ' ' + sizes[i];
}

function printProgressBar(current, total, barLength = 40) {
  const percent = current / total;
  const filled = Math.round(barLength * percent);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = (percent * 100).toFixed(1);
  process.stdout.write(`\r  Progress: [${bar}] ${percentage}% (${current}/${total}s)`);
}

async function runThroughputTest(config) {
  const { name, options } = config;
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🏃 Running: ${name}`);
  console.log(`${'─'.repeat(70)}`);
  
  const logger = new Logger(options);
  const monitor = new ThroughputMonitor(TEST_DURATION_SECONDS);
  
  monitor.start();
  const testEndTime = Date.now() + (TEST_DURATION_SECONDS * 1000);
  
  let iteration = 0;
  const messages = [
    'User login detected',
    'Processing transaction',
    'Database query executed',
    'API request received',
    'Cache miss occurred',
    'File uploaded successfully',
    'Email sent to user',
    'Background job started',
  ];
  
  // Run the test
  while (Date.now() < testEndTime) {
    const msgIndex = iteration % messages.length;
    logger.info(messages[msgIndex], { 
      id: iteration, 
      timestamp: Date.now(),
      data: { value: Math.random() }
    });
    monitor.recordLog();
    iteration++;
    
    // Update progress every 100ms
    if (iteration % 1000 === 0) {
      const elapsed = (Date.now() - monitor.startTime) / 1000;
      printProgressBar(Math.floor(elapsed), TEST_DURATION_SECONDS);
    }
  }
  
  monitor.end();
  printProgressBar(TEST_DURATION_SECONDS, TEST_DURATION_SECONDS);
  console.log('\n');
  
  // Flush and cleanup
  if (options.saveToLogFiles) {
    await logger.flush();
    await logger.shutdown();
  }
  
  return monitor;
}

function printResults(testName, monitor) {
  const avg = monitor.getAverageLogsPerSecond();
  const peak = monitor.getPeakLogsPerSecond();
  const min = monitor.getMinLogsPerSecond();
  const median = monitor.getMedianLogsPerSecond();
  const stdDev = monitor.getStdDev();
  
  console.log('\n📊 THROUGHPUT RESULTS');
  console.log(`  Total logs written:     ${formatNumber(monitor.totalLogs)}`);
  console.log(`  Test duration:          ${monitor.getTotalDuration().toFixed(2)}s`);
  console.log(`  Average logs/sec:       ${formatNumber(avg)} logs/s`);
  console.log(`  Peak logs/sec:          ${formatNumber(peak)} logs/s`);
  console.log(`  Min logs/sec:           ${formatNumber(min)} logs/s`);
  console.log(`  Median logs/sec:        ${formatNumber(median)} logs/s`);
  console.log(`  Std deviation:          ${formatNumber(stdDev)} logs/s`);
  console.log(`  Consistency:            ${((1 - stdDev/avg) * 100).toFixed(2)}%`);
  
  console.log('\n📈 PERCENTILES (logs per second)');
  console.log(`  P50 (median):           ${formatNumber(monitor.getPercentile(50))} logs/s`);
  console.log(`  P75:                    ${formatNumber(monitor.getPercentile(75))} logs/s`);
  console.log(`  P90:                    ${formatNumber(monitor.getPercentile(90))} logs/s`);
  console.log(`  P95:                    ${formatNumber(monitor.getPercentile(95))} logs/s`);
  console.log(`  P99:                    ${formatNumber(monitor.getPercentile(99))} logs/s`);
  
  console.log('\n⏱️  TIME-BASED METRICS');
  console.log(`  Time per log:           ${(1000000 / avg).toFixed(2)} μs`);
  console.log(`  Logs per millisecond:   ${(avg / 1000).toFixed(2)}`);
  console.log(`  Logs per minute:        ${formatNumber(avg * 60)}`);
  console.log(`  Logs per hour:          ${formatNumber(avg * 3600)}`);
  console.log(`  Logs per day (24h):     ${formatNumber(avg * 86400)}`);
  
  // Memory analysis
  if (monitor.memorySnapshots.length >= 2) {
    const initial = monitor.memorySnapshots[0];
    const final = monitor.memorySnapshots[monitor.memorySnapshots.length - 1];
    const heapDelta = final.heapUsed - initial.heapUsed;
    const rssDelta = final.rss - initial.rss;
    
    console.log('\n💾 MEMORY USAGE');
    console.log(`  Heap delta:             ${formatBytes(heapDelta)}`);
    console.log(`  RSS delta:              ${formatBytes(rssDelta)}`);
    console.log(`  Memory per log:         ${formatBytes(heapDelta / monitor.totalLogs)}`);
    console.log(`  Memory growth rate:     ${formatBytes(heapDelta / monitor.getTotalDuration())}/s`);
  }
  
  // Show second-by-second breakdown
  if (monitor.secondIntervals.length > 0 && monitor.secondIntervals.length <= 30) {
    console.log('\n📉 SECOND-BY-SECOND BREAKDOWN');
    monitor.secondIntervals.forEach((interval, idx) => {
      const bar = '▇'.repeat(Math.floor(interval.count / peak * 50));
      console.log(`  Second ${String(idx + 1).padStart(2)}:  ${formatNumber(interval.count).padStart(8)} logs/s ${bar}`);
    });
  }
}

async function runAllTests() {
  console.log('\n🚀 Logger Sustained Throughput Test');
  console.log(`⏱️  Test Duration: ${TEST_DURATION_SECONDS} seconds`);
  console.log(`💻 System: ${os.platform()} ${os.arch()}`);
  console.log(`🖥️  CPUs: ${os.cpus().length}x ${os.cpus()[0].model}`);
  console.log(`🧠 Total Memory: ${formatBytes(os.totalmem())}`);
  console.log(`⚙️  Node Version: ${process.version}`);
  
  const tests = [
    {
      name: 'Console Output Only (No File)',
      options: {
        basePath: path.join(os.tmpdir(), 'logger-throughput-test'),
        outputToConsole: false, // Disabled for speed
        saveToLogFiles: false,
        showTimestamps: true,
        showLogLevel: true,
      }
    },
    {
      name: 'File Writing Only (Worker Thread)',
      options: {
        basePath: path.join(os.tmpdir(), 'logger-throughput-test'),
        outputToConsole: false,
        saveToLogFiles: true,
        showTimestamps: true,
        showLogLevel: true,
      }
    },
    {
      name: 'Full Features (Console + File + CallSite)',
      options: {
        basePath: path.join(os.tmpdir(), 'logger-throughput-test'),
        outputToConsole: false, // Disabled for speed
        saveToLogFiles: true,
        showTimestamps: true,
        showLogLevel: true,
        showCallSite: true,
        showHostname: true,
        showProcessId: true,
      }
    },
  ];
  
  const results = [];
  
  for (const test of tests) {
    const monitor = await runThroughputTest(test);
    printResults(test.name, monitor);
    results.push({
      name: test.name,
      monitor: monitor,
    });
    
    // Cool down between tests
    if (tests.indexOf(test) < tests.length - 1) {
      console.log('\n⏸️  Cooling down for 2 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Comparison
  console.log('\n' + '═'.repeat(70));
  console.log('🏆 COMPARATIVE SUMMARY');
  console.log('═'.repeat(70));
  
  results.forEach((result, idx) => {
    const avg = result.monitor.getAverageLogsPerSecond();
    const peak = result.monitor.getPeakLogsPerSecond();
    console.log(`\n${idx + 1}. ${result.name}`);
    console.log(`   Average: ${formatNumber(avg)} logs/s`);
    console.log(`   Peak:    ${formatNumber(peak)} logs/s`);
    console.log(`   Total:   ${formatNumber(result.monitor.totalLogs)} logs`);
  });
  
  // Find the winner
  const winner = results.reduce((best, current) => {
    const bestAvg = best.monitor.getAverageLogsPerSecond();
    const currentAvg = current.monitor.getAverageLogsPerSecond();
    return currentAvg > bestAvg ? current : best;
  });
  
  console.log(`\n🥇 Fastest Configuration: ${winner.name}`);
  console.log(`   ${formatNumber(winner.monitor.getAverageLogsPerSecond())} logs/second`);
  console.log(`   That's ${formatNumber(winner.monitor.getAverageLogsPerSecond() * 3600)} logs/hour!`);
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ All tests completed!\n');
}

// Run the tests
console.log('\nAvailable test durations: burst (1s), short (5s), medium (10s), long (30s)');
console.log(`Usage: node ${path.basename(__filename)} [duration]`);
console.log(`Running with: ${selectedDuration} (${TEST_DURATION_SECONDS}s)\n`);

runAllTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});