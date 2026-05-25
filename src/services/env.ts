export const ENV = {
  jwtSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000", 10),
  // LLM / AI
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  // Storage (S3-compatible)
  storageApiUrl: process.env.STORAGE_API_URL ?? "",
  storageApiKey: process.env.STORAGE_API_KEY ?? "",
};
