/**
 * SMS MFA Provider — abstract interface + stub implementation (Spec §2.2 / Divergência #10)
 *
 * Swap the concrete provider without touching call sites:
 *   1. Set SMS_PROVIDER=twilio and provide TWILIO_* env vars → TwilioSmsProvider
 *   2. Set SMS_PROVIDER=aws_sns → AwsSnsSmsProvider (not yet implemented)
 *   3. Default (unset or stub) → StubSmsProvider (logs OTP to console/logger — dev only)
 *
 * OTP lifecycle:
 *   - Generated here with 6 random digits (CSPRNG)
 *   - Stored in-process Map with 10-minute TTL (replace with Redis for multi-instance)
 *   - Verified in the /auth/mfa/verify-sms endpoint
 */

import { createHash, randomInt } from 'crypto';
import { logger } from '../utils/logger.js';

// ============================================
// Abstract interface
// ============================================

export interface ISmsProvider {
  /** Send a 6-digit OTP to the given phone number. Returns true on success. */
  sendOtp(to: string, otp: string): Promise<boolean>;
}

// ============================================
// In-memory OTP store (dev/single-node only)
// Replace with Redis in production.
// ============================================

interface OtpEntry {
  hash: string;   // SHA-256 of the OTP to avoid storing plaintext
  exp:  number;   // Unix epoch seconds
  attempts: number;
}

const OTP_TTL_SECONDS = 10 * 60;      // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

const otpStore = new Map<string, OtpEntry>();

/** Generate a 6-digit OTP, store hashed copy, return plaintext (to be sent via SMS). */
export function generateSmsOtp(userId: string): string {
  const otp = String(randomInt(100000, 999999)); // CSPRNG, always 6 digits
  const hash = createHash('sha256').update(otp).digest('hex');
  otpStore.set(userId, {
    hash,
    exp: Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS,
    attempts: 0,
  });
  return otp;
}

/**
 * Verify a submitted OTP for a user.
 * Returns `true` if valid; `false` if wrong.
 * Throws an Error if the OTP is expired or if max attempts exceeded.
 */
export function verifySmsOtp(userId: string, submittedOtp: string): boolean {
  const entry = otpStore.get(userId);
  if (!entry) {
    throw new Error('Nenhum OTP SMS activo para este utilizador. Solicite um novo.');
  }
  if (Math.floor(Date.now() / 1000) > entry.exp) {
    otpStore.delete(userId);
    throw new Error('OTP SMS expirado. Solicite um novo.');
  }
  entry.attempts++;
  if (entry.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(userId);
    throw new Error('Número máximo de tentativas atingido. Solicite um novo OTP.');
  }

  const submittedHash = createHash('sha256').update(submittedOtp).digest('hex');
  const valid = submittedHash === entry.hash;
  if (valid) {
    otpStore.delete(userId); // One-time use
  }
  return valid;
}

// ============================================
// Stub provider (logs OTP — dev/staging only)
// ============================================

class StubSmsProvider implements ISmsProvider {
  async sendOtp(to: string, otp: string): Promise<boolean> {
    logger.warn(`[SMS STUB] OTP ${otp} → ${to}  (not sent — configure SMS_PROVIDER for production)`);
    // In dev, also print to stdout so testers can see it
    console.warn(`[SMS_MFA_STUB] TO=${to} OTP=${otp}`);
    return true;
  }
}

// ============================================
// Twilio provider (production — requires env vars)
// ============================================

class TwilioSmsProvider implements ISmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendOtp(to: string, otp: string): Promise<boolean> {
    // Dynamic import so Twilio package is optional
    try {
      const twilio = await import('twilio');
      const client = twilio.default(this.accountSid, this.authToken);
      await client.messages.create({
        body: `Seu código MFA: ${otp}. Válido por 10 minutos. Não compartilhe.`,
        from: this.fromNumber,
        to,
      });
      return true;
    } catch (err) {
      logger.error('[SMS TwilioProvider] Failed to send OTP', { to, error: err });
      return false;
    }
  }
}

// ============================================
// AWS SNS provider (production alternative to Twilio)
// ============================================

class AwsSnsSmsProvider implements ISmsProvider {
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly senderId: string;

  constructor(region: string, accessKeyId: string, secretAccessKey: string, senderId: string) {
    this.region = region;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.senderId = senderId;
  }

  async sendOtp(to: string, otp: string): Promise<boolean> {
    try {
      // AWS SDK v3 — dynamically imported so the package is optional at runtime
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      const client = new SNSClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });

      await client.send(new PublishCommand({
        PhoneNumber: to,
        Message: `Seu código MFA: ${otp}. Válido por 10 minutos. Não compartilhe.`,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: this.senderId },
        },
      }));

      return true;
    } catch (err) {
      logger.error('[SMS AwsSnsProvider] Failed to send OTP', { to, error: err });
      return false;
    }
  }
}

// ============================================
// Factory — resolves provider from env
// ============================================

function resolveSmsProvider(): ISmsProvider {
  const provider = process.env.SMS_PROVIDER?.toLowerCase() ?? 'stub';

  if (provider === 'twilio') {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      logger.warn('[SmsProvider] SMS_PROVIDER=twilio but TWILIO_* env vars missing — falling back to stub');
      return new StubSmsProvider();
    }
    return new TwilioSmsProvider(sid, token, from);
  }

  if (provider === 'aws_sns') {
    const region   = process.env.AWS_REGION || 'us-east-1';
    const keyId    = process.env.AWS_ACCESS_KEY_ID;
    const secret   = process.env.AWS_SECRET_ACCESS_KEY;
    const senderId = process.env.AWS_SNS_SENDER_ID || 'GEMS';
    if (!keyId || !secret) {
      logger.warn('[SmsProvider] SMS_PROVIDER=aws_sns but AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing — falling back to stub');
      return new StubSmsProvider();
    }
    return new AwsSnsSmsProvider(region, keyId, secret, senderId);
  }

  return new StubSmsProvider();
}

export const smsProvider: ISmsProvider = resolveSmsProvider();
