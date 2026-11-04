module.exports = {
  apps: [{
    name: 'dislava-bot',
    script: 'index.js',
    node_args: '--expose-gc --max-old-space-size=160',
    max_memory_restart: '220M',
    autorestart: true,
    watch: false
  }]
};
