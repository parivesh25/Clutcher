import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// strictPort: if 5173 is busy, fail loudly instead of moving to another port,
// because the backend only allows requests from 5173 (CORS).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
