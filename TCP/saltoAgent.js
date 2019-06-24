const net = require('net')
const xml2js = require('xml2js')
const js2xmlparser = require('js2xmlparser');
const fs = require('fs');
const AWS = require('aws-sdk');
const mysql = require('mysql');
const nanoid = require('nanoid');
const dotenv = require('dotenv');
dotenv.config()

const port = 3103
const host = '192.168.122.220'

AWS.config.update({ region: process.env.REGION})

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
    console.log("Salto Server connection established")
    //let data = fs.readFileSync('./TCP/inputData.json') 
    //let inputParameters = JSON.parse(data)
    actualCursor = await getActualCursor();
    //let startId = parseInt(inputParameters.startId, 10) + 1
    let startId = parseInt(actualCursor, 10) + 1
    sendXML.Params["StartingFromEventID"] = startId

    let xml = js2xmlparser.parse("RequestCall", sendXML, xmlOptions);
    let xmlLength = xml.length
    let stp = 'STP/00/' + xmlLength + '/' + xml.toString()
    console.info(stp)
    client.write(stp)
});


client.on('data', async function (chunk) {
    auditResponse += chunk.toString()
    await client.end()

});

client.on('close', function () {
    console.log('Salto Server closed connection');
    processResponse();

})

client.on('error', function (err) {
    console.error(err);
})


const  getActualCursor = async () => {
    console.log("searching cursor...");
    try {
      var params = {
        TableName: "dev_corserva_saltoCursor",
        Key: {
            serverName: { S: "SaltoDb" }
          },
        ProjectionExpression: "actualCursor"
      };
      const response = await ddb.getItem(params).promise();
      return (
        (response &&
          response.Item &&
          response.Item.actualCursor &&
          response.Item.actualCursor.S) ||
        false
      );
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  const updateCursor = async (actualCursor) => {
    console.log("updating cursor...");
    try {
      var params = {
        TableName: "dev_corserva_saltoCursor",
        Item: {
            serverName: { S: "SaltoDb" },
            actualCursor: {S: actualCursor}
          }
      };
      return await ddb.putItem(params).promise();
    } catch (e) {
      console.error(e);
      return errorResponse(e.message);
    }
  };  

async function processResponse() {
    var parser = new xml2js.Parser();
    let xmlResult = auditResponse.substring(auditResponse.indexOf('RequestResponse') - 1)
    await parser.parseString(xmlResult, async function (err, result) {
        let resultParams = result.RequestResponse.Params[0]
        let resultAuditTrail = resultParams.SaltoDBAuditTrail[0]
        let resultEvents = resultAuditTrail.SaltoDBAuditTrailEvent
        // let maxId = resultEvents[resultEvents.length - 1].EventID.toString()
        // let obj = {
        //     "startId": maxId
        // }
        // fs.writeFileSync('./TCP/inputData.json', JSON.stringify(obj)) //reading from parent directory
        alertDoorIds = resultEvents.map(event => {
            return event.DoorID[0]
        })
        await sendtoDataBase(alertDoorIds, resultEvents)
    })
    
}


async function sendtoDataBase(idDoors, saltoAlerts){
    
    var con = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD
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
                con.destroy()
                console.log("Mysql connection closed")
            }
            
            relatedDevices = JSON.parse(JSON.stringify(relatedDevices))
            if (relatedDevices.length>0){
                await Promise.all(relatedDevices.map(async device =>{
                    //let alerts = saltoAlerts.filter(alert => alert.DoorID[0] == device.name)
                    let alerts = await Promise.all(saltoAlerts.filter(async alert => alert.DoorID[0] == 'ORL-2nd Fl Front Door'))
                    if (alerts.length > 0){
                        await Promise.all(alerts.map(async alert=>{
                            try {
                                let nanoId = nanoid()
                                const params = {
                                    TableName: "Alert",
                                    Item: {
                                        id: { S: nanoId },
                                        severityStatusDate: {S: "INFO#NOTSOLVED#" + alert.EventDateTime[0].toString()},
                                        tenantId: {S: device.tenantId},
                                        tenantName: {S: device.tenantName},
                                        propertyId: {S: device.propertyId},
                                        propertyName: {S: device.propertyName},
                                        buildingId: {S: device.buildingId},
                                        buildingName: {S: device.buildingName},
                                        floorId: {S: device.floorId},
                                        floorName: {S: device.floorName},
                                        roomId: {S: device.roomId},
                                        roomName: {S: device.roomName},
                                        deviceId: {S: device.id},
                                        deviceName: {S: device.name},
                                        networkGatewayId: {S: device.networkGatewayId},
                                        networkGatewayName: {S: device.networkGatewayName},
                                        iotGatewayId: {S: device.iotGatewayId},
                                        iotGatewayName: {S: device.iotGatewayName},
                                        status: {S: "NOT SOLVED"},
                                        severity: {S: "INFO"},
                                        description: {S: alert.Operation[0]},
                                        code: {S: alert.EventID[0]},
                                        macAddress: {S: device.macAddress},
                                        serialNumber: {S: device.serialNumber},
                                        model: {S: device.model}
                                    }
                                };
                                return await ddb.putItem(params).promise();
                            } catch (e) {
                                console.error(e);
                                con.destroy()
                                console.log("Mysql connection closed")
                                return errorResponse(e.statusCode, e.message);
                            }
                        }))
                    }
                }))
            }
            let maxId = saltoAlerts[saltoAlerts.length - 1].EventID.toString()
            updateCursor(maxId)
            con.destroy()
            console.log("Mysql connection closed")
        })
    })
}