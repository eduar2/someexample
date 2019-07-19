module.exports = {
    apps: [{
        name: "app",
        script: "./TCP/assaAbloy.js", 
        autorestart: false,
        cron: "*/5 * * * *", //every one minute takes the execution
        // env:{
        //     REGION: 'us-east-1',
        //     MYSQL_HOST: 'localhost',
        //     MYSQL_USER: 'root',
        //     MYSQL_PASSWORD: 'password'
        // }
    }]
}