import { NextResponse } from 'next/server';
import { getPreset, getThresholds } from '@/lib/config';

/** GET /api/config - thresholds (optional mask), preset, env indicators. For dashboard tuning. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mask = searchParams.get('mask') !== 'false'; // default mask values for security
  const preset = getPreset();
  const thresholds = getThresholds();

  const payload: Record<string, unknown> = {
    preset,
    presets: ['strict', 'normal', 'lenient'],
    RTP_MIN_PCT: process.env.RTP_MIN_PCT ? (mask ? '***' : thresholds.rtpMin) : thresholds.rtpMin,
    RTP_MAX_PCT: process.env.RTP_MAX_PCT ? (mask ? '***' : thresholds.rtpMax) : thresholds.rtpMax,
    WIN_RATE_SUSPICIOUS_PCT: process.env.WIN_RATE_SUSPICIOUS_PCT ? (mask ? '***' : thresholds.winRateSuspiciousPct) : thresholds.winRateSuspiciousPct,
    RATE_ABUSE_PER_MIN: process.env.RATE_ABUSE_PER_MIN ? (mask ? '***' : thresholds.rateAbusePerMin) : thresholds.rateAbusePerMin,
    ALERT_COOLDOWN_MS: process.env.ALERT_COOLDOWN_MS ? (mask ? '***' : thresholds.alertCooldownMs) : thresholds.alertCooldownMs,
    REPEATED_BET_COUNT_THRESHOLD: process.env.REPEATED_BET_COUNT_THRESHOLD ? (mask ? '***' : thresholds.repeatedBetCountThreshold) : thresholds.repeatedBetCountThreshold,
    SESSION_LENGTH_MAX_HOURS: process.env.SESSION_LENGTH_MAX_HOURS ? (mask ? '***' : thresholds.sessionLengthMaxHours) : thresholds.sessionLengthMaxHours,
    PLAYERS_PER_IP_THRESHOLD: process.env.PLAYERS_PER_IP_THRESHOLD ? (mask ? '***' : thresholds.playersPerIpThreshold) : thresholds.playersPerIpThreshold,
    PLAYERS_PER_DEVICE_THRESHOLD: process.env.PLAYERS_PER_DEVICE_THRESHOLD ? (mask ? '***' : thresholds.playersPerDeviceThreshold) : thresholds.playersPerDeviceThreshold,
    INGEST_API_KEY: process.env.INGEST_API_KEY ? 'set' : undefined,
    WEBHOOK_URL: process.env.WEBHOOK_URL ? 'set' : undefined,
    DATA_SOURCE: process.env.DATA_SOURCE || 'memory',
    EVENTS_RETENTION_DAYS: process.env.EVENTS_RETENTION_DAYS || 7,
    ALERTS_RETENTION_DAYS: process.env.ALERTS_RETENTION_DAYS || 30,
  };

  return NextResponse.json(payload);
}
