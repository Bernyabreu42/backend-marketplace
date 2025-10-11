const defaults = {
  NODE_ENV: "test",
  API_USERNAME: "test-user",
  API_PASSWORD: "test-pass",
  JWT_SECRET: "test-secret",
  JWT_REFRESH_SECRET: "test-refresh-secret",
  EMAIL_TOKEN_SECRET: "test-email-secret",
  RESET_SECRET: "test-reset-secret",
  CLIENTS_URLS: '["http://localhost:3000"]',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
