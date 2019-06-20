const net = require('net')
const xml2js = require('xml2js')
const js2xmlparser = require('js2xmlparser');
const fs = require('fs');

const port = 3103
const host = '192.168.122.220'

var xmlOptions = {
    declaration: {
        encoding: "ISO-8859-1"
    }
}

var sendXML = {
    "RequestName": "Dataset.GetRows",
    "Params": {
        "DBEntityName": "Dataset_Doors",
        "MaxRows": 100
    }
}

const client = new net.Socket();


let auditResponse = ''


client.connect(port, host, async function () {
    console.log("connection established")
    // let data = fs.readFileSync('./TCP/inputData.json') //reading from parent directory
    // let inputParameters = JSON.parse(data)
    // let startId = parseInt(inputParameters.startId, 10) + 1
    // sendXML.Params["StartingFromEventID"] = startId

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

function processResponse() {
    var parser = new xml2js.Parser();
    let xmlResult = auditResponse.substring(auditResponse.indexOf('RequestResponse') - 1)
    parser.parseString(xmlResult, function (err, result) {
        let resultParams = result.RequestResponse.Params[0]
        let listDoors = resultParams.RowList[0].Row
        // let resultAuditTrail = resultParams.SaltoDBAuditTrail[0]
        // let resultEvents = resultAuditTrail.SaltoDBAuditTrailEvent
        // let maxId = resultEvents[resultEvents.length - 1].EventID.toString()
        // let obj = {
        //     "startId": maxId
        // }
        // fs.writeFileSync('./TCP/inputData.json', JSON.stringify(obj)) //reading from parent directory
        console.log(listDoors)
        console.log(listDoors.length)
    })
}