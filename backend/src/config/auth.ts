const requireSecret = (name: string): string => {
  const secret = process.env[name];
  if (!secret || secret.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return secret;
};
export default {
  secret: requireSecret("JWT_SECRET"),
  expiresIn: "15m",
  refreshSecret: requireSecret("JWT_REFRESH_SECRET"),
  refreshExpiresIn: "7d"
} as const;
