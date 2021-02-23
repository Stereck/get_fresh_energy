var request = require('request')
var mqtt = require('mqtt')
var authToken, smartMeterId, userId

var config = require('./config')
var authEndpoint = 'https://app.getfresh.energy/authenticate/'
var readingsEndpoint = "https://app.getfresh.energy/readings/users/"

try {
  var client = mqtt.connect(
    `${config.mqtt.server}:${config.mqtt.port}`, 
    { 
      username: config.mqtt.username, 
      password: config.mqtt.password 
    }
  )
  setInterval(sendRequest, config.getfresh.refresh * 1000)
} catch (e) {
  console.log(new Date().toISOString() + e);
}

function sendRequest() {
  request({
    url: readingsEndpoint + userId + "/meters/" + smartMeterId + '/latest?from=' + new Date(new Date().setSeconds(new Date().getSeconds() - config.getfresh.refresh)).toISOString(),
    headers: { 'Authorization': 'Bearer ' + authToken }
  }, callbackReadings)
}

function callbackAuth(error, response, body) {
  if (!error && response.statusCode == 200) {
    var payload = JSON.parse(body)
    authToken = payload.access_token
    payload.scope.forEach((scope) => {
      if (scope.includes("USER_METER")) {
        var meter = scope.split(";")
        smartMeterId =  meter[2]
      }
    })
    userId = payload.userId
  } else {
    console.log("Auth error " + error);
  }
}

function callbackReadings(error, response, body) {
  if (!error && response.statusCode == 200) {
    var payload = JSON.parse(body)
    if (payload.readings.length < 1) { return }
    var lastReading = payload.readings[payload.readings.length - 1]
    console.log("Write readings to MQTT");
    client.publish('power', lastReading.power.toString())
    client.publish('phase1', lastReading.powerPhase1.toString())
    client.publish('phase2', lastReading.powerPhase2.toString())
    client.publish('phase3', lastReading.powerPhase3.toString())
    client.publish('energyReading', lastReading.energyReading.toString())
  } else if (response.statusCode == 401) {
    console.log("Start authentication");
    getAuthToken()
  } else {
    console.log("Error fetching readings " + response.statusCode);
  }
}

function getAuthToken() {
  request({
    url: authEndpoint,
    method: 'POST',
    form: { 
      grant_type: 'password', 
      partner: 'fresh',
      password: config.getfresh.password, 
      username: config.getfresh.user 
    }
  }, callbackAuth)
}
