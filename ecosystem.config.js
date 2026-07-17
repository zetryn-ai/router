module.exports = {
  apps: [
    {
      name: 'zetryn-router',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '4790',
        DATA_DIR: process.env.DATA_DIR || './data',
        // ROUTER_SECRET_KEY and JWT_SECRET must be provided via the environment
        // (e.g. a .env file loaded by your shell, or pm2 --env) — never hardcode them here.
      },
      instances: 1,
      autorestart: true,
    },
  ],
}
