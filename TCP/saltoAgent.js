const net = require('net')
const xml2js = require('xml2js')
const js2xmlparser = require('js2xmlparser');
const fs = require('fs');
const AWS = require('aws-sdk');
const mysql = require('mysql');

const port = 3103
const host = '192.168.122.220'
const ddb = new AWS.DynamoDB({ apiCVersion: "2012-8-10"});


var xmlOptions = {
    declaration: {
        encoding: "ISO-8859-1"
    }
}

var sendXML = {
    "RequestName": "SaltoDBAuditTrail.Read",
    "Params": {
        "MaxCount": 10,
        "DescendingOrder": 0,
        "StartingFromEventID": null
    }
}

const client = new net.Socket();


let auditResponse = ''

client.connect(port, host, async function () {
    console.log(process.env.REGION)
    console.log("connection established")
    let data = fs.readFileSync('./TCP/inputData.json') //reading from parent directory
    let inputParameters = JSON.parse(data)
    let startId = parseInt(inputParameters.startId, 10) + 1
    sendXML.Params["StartingFromEventID"] = startId

    let xml = js2xmlparser.parse("RequestCall", sendXML, xmlOptions);
    let xmlLength = xml.length
    let stp = 'STP/00/' + xmlLength + '/' + xml.toString()
    console.log(stp)
    client.write(stp)
});


client.on('data', async function (chunk) {
    auditResponse += chunk.toString()
    await client.end()

});

client.on('close', function () {
    console.log('Closed connection');
    processResponse();

})

client.on('error', function (err) {
    console.log('HORROR')
    console.log(process.env.REGION)
    console.error(err);
})

function processResponse() {
    var parser = new xml2js.Parser();
    let xmlResult = auditResponse.substring(auditResponse.indexOf('RequestResponse') - 1)
    parser.parseString(xmlResult, function (err, result) {
        let resultParams = result.RequestResponse.Params[0]
        let resultAuditTrail = resultParams.SaltoDBAuditTrail[0]
        let resultEvents = resultAuditTrail.SaltoDBAuditTrailEvent
        let maxId = resultEvents[resultEvents.length - 1].EventID.toString()
        let obj = {
            "startId": maxId
        }
        fs.writeFileSync('./TCP/inputData.json', JSON.stringify(obj)) //reading from parent directory
        console.log(resultEvents[0])
        console.log(resultEvents[resultEvents.length - 1])
        console.log("max Id found: " + maxId)
    })
    sendtoDataBase()
}

function sendtoDataBase(){
    AWS.config.update({ region: process.env.REGION })
    var con = mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD
    });

    con.connect(function(err){
        if (err)
            console.error(err)
        console.log("MySQL connected")    

        // mysqlConnection.query("select * from master.room", function(err,result,fields){
        //     if(err) 
        //         console.error(err)
        //     console.info(result)
        // })
    })
}