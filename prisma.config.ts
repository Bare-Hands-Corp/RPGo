// Configuração do Prisma 7+ — substitui o uso de `directUrl` no schema.
// O DIRECT_URL aqui é usado APENAS pelas operações de CLI (db push, migrate, etc).
// Em runtime, o PrismaClient continua usando DATABASE_URL definido no schema.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
