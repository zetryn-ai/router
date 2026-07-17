module.exports = {
  apps: [
    {
      name: 'zetryn-router',
      script: 'node_modules/next/dist/bin/next',
      // Bind to loopback only — the router injects real API keys and has no
      // upstream auth of its own, so it must never be exposed on a public interface.
      args: 'start -H 127.0.0.1 -p 4790',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '4790',
        DATA_DIR: process.env.DATA_DIR || './data',
        // ROUTER_SECRET_KEY and JWT_SECRET must be provided via the environment
        // (e.g. an .env file loaded by your shell, or pm2 --env) — never hardcode them here.
      },
      instances: 1,
      autorestart: true,
    },
  ],
}
