/**
 * Threshold presets (strict / normal / lenient) and env overrides.
 * Used by detection and exposed via /api/config for dashboard tuning.
 */
import type { ThresholdPreset, Thresholds } from './types';

const PRESETS: Record<ThresholdPreset, Thresholds> = {
  strict: {
    rtpMin: 88,
    rtpMax: 100,
    winRateSuspiciousPct: 55,
    rateAbusePerMin: 80,
    alertCooldownMs: 15 * 60 * 1000,
    repeatedBetCountThreshold: 5,
    sessionLengthMaxHours: 4,
    playersPerIpThreshold: 3,
    playersPerDeviceThreshold: 2,
  },
  normal: {
    rtpMin: 85,
    rtpMax: 102,
    winRateSuspiciousPct: 65,
    rateAbusePerMin: 120,
    alertCooldownMs: 10 * 60 * 1000,
    repeatedBetCountThreshold: 8,
    sessionLengthMaxHours: 8,
    playersPerIpThreshold: 5,
    playersPerDeviceThreshold: 3,
  },
  lenient: {
    rtpMin: 82,
    rtpMax: 105,
    winRateSuspiciousPct: 75,
    rateAbusePerMin: 180,
    alertCooldownMs: 5 * 60 * 1000,
    repeatedBetCountThreshold: 12,
    sessionLengthMaxHours: 12,
    playersPerIpThreshold: 8,
    playersPerDeviceThreshold: 5,
  },
};

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Get current preset from env (THRESHOLD_PRESET=strict|normal|lenient). Default normal. */
export function getPreset(): ThresholdPreset {
  const p = (process.env.THRESHOLD_PRESET || 'normal').toLowerCase();
  if (p === 'strict' || p === 'lenient') return p;
  return 'normal';
}

/** Get thresholds: preset base + env overrides. */
export function getThresholds(): Thresholds {
  const preset = PRESETS[getPreset()];
  return {
    rtpMin: envNum('RTP_MIN_PCT', preset.rtpMin),
    rtpMax: envNum('RTP_MAX_PCT', preset.rtpMax),
    winRateSuspiciousPct: envNum('WIN_RATE_SUSPICIOUS_PCT', preset.winRateSuspiciousPct),
    rateAbusePerMin: envNum('RATE_ABUSE_PER_MIN', preset.rateAbusePerMin),
    alertCooldownMs: envNum('ALERT_COOLDOWN_MS', preset.alertCooldownMs),
    repeatedBetCountThreshold: envNum('REPEATED_BET_COUNT_THRESHOLD', preset.repeatedBetCountThreshold),
    sessionLengthMaxHours: envNum('SESSION_LENGTH_MAX_HOURS', preset.sessionLengthMaxHours),
    playersPerIpThreshold: envNum('PLAYERS_PER_IP_THRESHOLD', preset.playersPerIpThreshold),
    playersPerDeviceThreshold: envNum('PLAYERS_PER_DEVICE_THRESHOLD', preset.playersPerDeviceThreshold),
  };
}

export { PRESETS };
