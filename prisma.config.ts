import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // Use process.env instead of env() to avoid build-time errors
    // prisma generate doesn't need a real connection, just a valid URL format
    url: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
})
