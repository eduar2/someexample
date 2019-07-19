var btoa = require('btoa');
const utf8 = require('utf8');
const path = require('path');
const AWS = require('aws-sdk');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const nanoid = require('nanoid');
const cryptojs = require('crypto-js');
var md5sum = crypto.createHash('md5');
require('dotenv').config({ path: path.join(__dirname, '.env') });

AWS.config.update({ region: process.env.REGION })
let signature
let sessionId
const ddb = new AWS.DynamoDB({ apiCVersion: "2012-8-10" });

async function main() {
  actualCursor = await getActualCursor();
  let sessionCreated = await createSession()
  if (sessionCreated) {
    let alarmTypes = await getAlarmTypes()
    if (alarmTypes) {
      let alarms = await getAlarms(actualCursor, alarmTypes)
      if (alarms && alarms.length >0){
          await sendtoDataBase(alarms)
          console.log("successfull completed")
      }
    }
    else {
      console.log("Could not get the alarm types")
      return "Could not get the alarm types"
    }
  }
  else {
    console.log("Could not connect to Assa Abloy Server.")
    return "Could not connect to Assa Abloy Server."
  }
}

async function createSession() {
  console.log("creating session...");
  let body = {
    username: process.env.API_USER,
    password: process.env.API_PASSWORD
  }
  try {
    let session = await callServer("post", "sessions", body, false)
    if (session && session.id) {
      sessionId = session.id
      signature = session.accessKey
      return true
    }
    return false
  } catch (e) {
    console.error(e.message)
    return false
  }
};

async function getAlarmTypes() {
  console.log("getting types of alarms...")
  try {
    let alarmTypes = await callServer('get', 'alarmTypes', null, true)
    return alarmTypes
  } catch (error) {
    console.error(error.message)
    return
  }
}

async function getAlarms(actualCursor, alarmTypes) {
  console.log("getting alarms...")
  try {
    let urlPath = (actualCursor) ? `alarms?updatedSince=${actualCursor}` : `alarms`
    let alarms = await callServer("get", urlPath, null, true)
    let maxUpdateTime = await alarms.reduce(function (prev, current) {
      return (prev.updateTime > current.updateTime) ? prev.updateTime : current.updateTime
    })
    let richedAlarms
    if (alarms) {
      richedAlarms = await Promise.all(alarms.map(async alarm => {
        let id = alarm.id
        let actualAlarm = await callServer("get", `alarms/${id}`, null, true)
        if (actualAlarm.door) {
          type = await alarmTypes.filter(type => {
            return actualAlarm.alarmType == type.id
          })
          let solved = (actualAlarm.completed) ? "SOLVED" : "NOTSOLVED"
          let nanoId = nanoid()
          let item = {
            id: { S: nanoId },
            deviceId: {S: actualAlarm.door},
            severityStatusDate: { S: `INFO#${solved}#` + actualAlarm.alarmTime },
            status: {S: solved},
            severity: { S: "INFO" },
            description: {S: type[0].name},
            code: {S: type[0].id},
          }
          return item
        }
      }))
    }
    richedAlarms = richedAlarms.filter(alarm =>{ return (!!alarm) })
    await updateCursor(maxUpdateTime)
    return richedAlarms
  } catch (error) {
    console.error(error.message)
    return error.message
  }
}

async function callServer(method, operation, body, sign) {
  let url = `https://192.168.122.60/api/v1/${operation}`
  console.info("calling server... " + url)
  let actualDate = new Date().toUTCString()
  let dateString = actualDate.split(' ').slice(0, 5).join(' ');
  dateString = dateString + ' +0000'
  let headers = { "Date": dateString }
  const agent = await new https.Agent({ rejectUnauthorized: false });
  let resp
  if (body) {
    md5sum.update(JSON.stringify(body))
    let base64 = btoa(md5sum.digest())
    headers["Content-MD5"] = base64
    headers["Content-Type"] = "application/json;charset=utf-8"
  }
  if (signature && sign) {
    let stringToSign = method.toUpperCase() + "\n"
    stringToSign += (headers["Content-MD5"]) ? headers["Content-MD5"] + "\n" : "\n"
    stringToSign += (headers["Content-Type"]) ? headers["Content-Type"] + "\n" : "\n"
    stringToSign += headers["Date"] + "\n"
    stringToSign += process.env.URL_TO_SIGN + "/" + operation

    let hash = cryptojs.HmacSHA1(utf8.encode(stringToSign), signature)
    var hashInBase64 = cryptojs.enc.Base64.stringify(hash);
    let authorization = `AWS ${sessionId}:${hashInBase64}`
    headers["Authorization"] = authorization
  }
  try {
    const instance = await axios.create({
      baseURL: process.env.END_POINT,
      httpsAgent: agent,
      headers: headers
    });
    if (method == 'get') {
      await instance.get(operation).then((res) => {
        if (res.status == 200 || res.status == 201) {
          // ///*************THIS IS ONLY FOR TEST PURPOSE*****************/
          // if (res.data && res.data.length > 5 && operation.includes("alarms")) {
          //   res.data.splice(5) ///*************THIS IS ONLY FOR TEST PURPOSE*****************/
          //   resp = res.data
          // }
          // ///*************THIS IS ONLY FOR TEST PURPOSE*****************/
          // else {
            resp = res.data
          // }
        }
      })
    }
    else if (method == 'post') {
      await instance.post(operation, body).then((res) => {
        if (res.status == 200 || res.status == 201) {
          resp = res.data
        }
      })
    }
  } catch (e) {
    if (e.response)
      console.error(e.response.data.message)
    else
      console.error(e.message)
    throw new Error(e.response.data.message ? e.response.data.message : e.message)
  }
  return resp
};

async function getActualCursor() {
  console.log("searching cursor...");
  try {
    var params = {
      TableName: "dev_corserva_saltoCursor",
      Key: {
        serverName: { S: "AssaAbloy" }
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
    console.log(e.message);
    return false;
  }
};

async function updateCursor(actualCursor) {
  console.log("updating cursor...");
  try {
    var params = {
      TableName: "dev_corserva_saltoCursor",
      Item: {
        serverName: { S: "AssaAbloy" },
        actualCursor: { S: actualCursor }
      }
    };
    return await ddb.putItem(params).promise();
  } catch (e) {
    console.error(e);
    return errorResponse(e.message);
  }
};

async function sendtoDataBase(items) {
  if (items.length > 0) {
      await Promise.all(items.map(async item => {
          try {
              const params = {
                  TableName: "Alert",
                  Item: item
              };
              return await ddb.putItem(params).promise();
          } catch (e) {
              console.error(e);
              return errorResponse(e.statusCode, e.message);
          }
      }))
  }
}

main();