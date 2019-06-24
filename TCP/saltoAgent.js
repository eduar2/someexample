const net = require('net')
const xml2js = require('xml2js')
const js2xmlparser = require('js2xmlparser');
const fs = require('fs');
const AWS = require('aws-sdk');
const mysql = require('mysql');
const nanoid = require('nanoid');

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
    //console.log(process.env.REGION)
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
    console.error(err);
})

async function processResponse() {
    var parser = new xml2js.Parser();
    let xmlResult = auditResponse.substring(auditResponse.indexOf('RequestResponse') - 1)
    await parser.parseString(xmlResult, async function (err, result) {
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
        alertDoorIds = resultEvents.map(event => {
            return event.DoorID[0]
        })
        await sendtoDataBase(alertDoorIds, resultEvents)
    })
    
}

async function sendtoDataBase(idDoors, saltoAlerts){
    // AWS.config.update({ region: process.env.REGION })
    // var con = await mysql.createConnection({
    //     host: process.env.MYSQL_HOST,
    //     user: process.env.MYSQL_USER,
    //     password: process.env.MYSQL_PASSWORD
    // });

    AWS.config.update({ region: "us-east-1" })
    var con = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'password'
    });
    idDoors.push("Amazon Echo Kellie")
    con.connect(function(err){
        if (err){
            console.error(err)
        }
        console.log("MySQL connected")    
        let query = "select * from master.device where name in (?)"
        let queryData = [idDoors]
        con.query(query,queryData,async function(err,relatedDevices){
            if (err){
                console.error(err)
            }
            relatedDevices = JSON.parse(JSON.stringify(relatedDevices))
            await Promise.all(relatedDevices.map(device =>{
                // let alerts = saltoAlerts.filter(alert => alert.DoorID[0] == device.name)
                let alerts = await Promise.all(saltoAlerts.filter(alert => alert.DoorID[0] == 'ORL-2nd Fl Front Door'))
                let richAlerts =await Promise.all(alerts.map(alert=>{
                    let richAlert={
                        id: nanoid(),
                        tenantId: device.tenantId,
                        tenantName: device.tenantName,
                        propertyId: device.propertyId,
                        propertyName: device.propertyName,
                        buildingId: device.buildingId,
                        buildingName: device.buildingName,
                        floorId: device.floorId,
                        floorName: device.floorName,
                        roomId: device.roomId,
                        roomName: device.roomName,
                        deviceId: device.id,
                        deviceName: device.name,
                        networkGatewayId: device.networkGatewayId,
                        networkGatewayName: device.networkGatewayName,
                        iotGatewayId: device.iotGatewayId,
                        iotGatewayName: device.iotGatewayName,
                        status: "PENDING",
                        severity: "INFO",
                        description: alert.Operation[0],
                        solution: "",
                        code: alert.EventID[0],
                        macAddress: device.macAddress,
                        serialNumber: device.serialNumber,
                        model: device.model
                    }
                    try {
                        const params = {
                          TableName: "Alert",
                          Item: {
                            richAlert
                          }
                        };
                        return await ddb.putItem(params).promise();
                      } catch (e) {
                        console.error(e);
                    
                        return errorResponse(e.statusCode, e.message);
                      }
                    return richAlert;
                }))
                //write alerts
                return richAlerts;
            }))
            con.destroy()
            console.log("Mysql connection closed")
        })
    })
}