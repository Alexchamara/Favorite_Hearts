/**
 * Login / verification code channels (D2: signup by SMS or email, member's choice).
 * Email codes are delivered through Resend; SMS codes through a provider adapter
 * chosen later. Better-Auth generates, stores and checks the codes.
 */
export const LOGIN_CHANNELS = ['email', 'sms'] as const;
export type LoginChannel = (typeof LOGIN_CHANNELS)[number];

/** SMS providers the API knows. `none` = not configured yet; `log` = local development only. */
export const SMS_PROVIDERS = ['none', 'log'] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export const CODE_LENGTH = 6;
/** Seconds a login code stays valid. */
export const CODE_TTL_SECONDS = 600;

/** Staff roles (D10). Members have no staff role. */
export const STAFF_ROLES = ['owner', 'backup_reviewer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
