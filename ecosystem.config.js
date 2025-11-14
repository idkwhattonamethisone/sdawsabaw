module.exports = {
  apps: [
    {
      name: 'sanrico-mercantile',
      script: './server.js',
      cwd: '/var/www/sanrico-mercantile',
      env_file: './.env',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'n8n',
      script: './start-n8n.sh',
      cwd: '/var/www/sanrico-mercantile',
      interpreter: '/bin/bash',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/n8n-err.log',
      out_file: './logs/n8n-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};

