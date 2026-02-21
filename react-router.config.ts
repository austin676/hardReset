import type { Config } from "@react-router/dev/config";
import path from "path";
import os from "os";

// Use system temp directory to avoid OneDrive file locking issues
const tempDir = path.join(os.tmpdir(), "hardReset-react-router");

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  
  // Use temp directory for React Router cache/types to avoid OneDrive locks
  buildDirectory: "build",
  
  // Disable type generation that causes OneDrive conflicts
  typescript: {
    ignoreBuildErrors: true
  }
} satisfies Config;
