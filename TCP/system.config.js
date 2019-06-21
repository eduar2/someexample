module.exports = {
    apps: [{
        name: "app",
        script: "./TCP/saltoAgent.js", //taking from parent directory
        autorestart: false,
        cron: "*/25 * * * *", //every one minute takes the execution
        env:{
            REGION: 'us-east-1',
            MYSQL_HOST: 'localhost',
            MYSQL_USER: 'root',
            MYSQL_PASSWORD: 'password'
        }
    }]
}