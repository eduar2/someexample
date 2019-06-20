
The file /system.config.js has the configuration.
You can configure:
- name: the name of the app.
- script: the nodeJs script that will be executed
- autorestart: set to false, in order to achieve only one execution. (If is set to true or ommited, it will be executed many times until it will be stopped).
- cron: This is configured to execute the script in a configured time. 
(Note: you can use https://crontab.guru to check the configuration of cron)

The file inputData.json has startId Parameter. It will be updated in every execution.

To execute you need pm2:
$ yarn add global pm2
Need to be in parent directory (bug) to execute with the command:
$pm2 start TCP\system.config.js