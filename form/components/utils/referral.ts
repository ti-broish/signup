/**
 * Generate a short referral code (6-8 characters)
 * Uses alphanumeric characters, excluding ambiguous ones (0, O, I, l)
 */
export function generateReferralCode(): string {
  // Exclude ambiguous characters: 0, O, I, l
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const length = 6; // Short code for easy sharing
  
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Get referral code from URL query parameters
 */
export function getReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  
  const params = new URLSearchParams(window.location.search);
  return params.get('ref') || null;
}
