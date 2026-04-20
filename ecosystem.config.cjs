module.exports = {
    apps: [{
        name: 'inventory',
        script: 'server.js',
        cwd: './API',          // ← เปลี่ยนจาก ./backend เป็น ./API
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        restart_delay: 5000,
        max_restarts: 10,
        env: {
            NODE_ENV: 'production',
        }
    }]
};