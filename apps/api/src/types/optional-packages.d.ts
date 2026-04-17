/**
 * Ambient module declarations for optional runtime packages.
 * These packages are dynamically imported inside try/catch — if not installed,
 * the feature gracefully degrades. TypeScript needs the declaration to compile.
 *
 * To activate each integration:
 *   npm install @sentry/node        (set SENTRY_DSN)
 *   npm install twilio              (set SMS_TWILIO_ACCOUNT_SID etc.)
 *   npm install @aws-sdk/client-sns (set SMS_AWS_REGION etc.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@sentry/node' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry: any;
  export = Sentry;
}

declare module 'twilio' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const twilio: any;
  export default twilio;
}

declare module '@aws-sdk/client-sns' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const SNSClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const PublishCommand: any;
}
