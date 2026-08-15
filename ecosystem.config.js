module.exports = {
  apps: [
    {
      name: "tasks-bubld-com",
      cwd: "/home/tasksapp/public_html",
      script: "npm",
      // Bind to loopback only -- reachable exclusively through nginx's
      // reverse proxy, never directly from the open internet.
      args: "start -- -p 3008 -H 127.0.0.1",

      // Load-bearing, not stylistic: better-sqlite3 is a single-writer
      // database. Running more than one instance (or cluster mode) would
      // let two processes write to the same file concurrently and corrupt
      // it.
      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      listen_timeout: 15000,
      stop_exit_codes: [0],

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
