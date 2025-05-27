module.exports = {
    apps: [
        {
            name: 'botview',
            script: 'npm',
            args: 'run start',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '400M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};