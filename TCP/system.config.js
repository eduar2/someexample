module.exports = {
    apps: [{
        name: "app",
        script: "./TCP/tcpNodeClient.js", //taking from parent directory
        autorestart: false,
        cron: "*/5 * * * *" //every one minute takes the execution
    }]
}