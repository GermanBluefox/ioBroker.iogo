/* jshint -W097 */
/* jshint strict:false */
/* global require */
/* global RRule */
/* global __dirname */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
let utils = require('@iobroker/adapter-core'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.iogo.0
let adapter;

let config = {
    apiKey: "AIzaSyBxrrLcJKMt33rPPfqssjoTgcJ3snwCO30",
    authDomain: "iobroker-iogo.firebaseapp.com",
    databaseURL: "https://iobroker-iogo.firebaseio.com",
    projectId: "iobroker-iogo",
    storageBucket: "iobroker-iogo.appspot.com",
    messagingSenderId: "1009148969935"
  };
let firebase = require("firebase");
require("firebase/storage");
global.XMLHttpRequest = require("xhr2");

const AdapterSyncService = require('./lib/adapter-service');
const EnumSyncService = require('./lib/enum-service');
const HostSyncService = require('./lib/host-service');
const InstanceSyncService = require('./lib/instance-service');
const MessageSendService = require('./lib/message-service');
const StateSyncService = require('./lib/state-service');

let uid;
let database;
let firestore;
let dbDevicesRef;
let dbCommandQueuesRef;
let loggedIn = false;
const commands = {};
let devices = {};
let deviceAlive = false;
let adapterService;
let enumService;
let hostService;
let instanceService;
let messageService;
let stateService;

function startAdapter(options) {
    options = options || {};
    Object.assign(options,{
        name:  "iogo",

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: function (callback) {
            _unload(callback);
        },

        // is called if a subscribed object changes
        objectChange: function (id, obj) {
            _objectChange(id, obj)
        },

        stateChange: function(id, state){
            _stateChange(id, state)
        },

        // Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
        message: function (obj) {
            _message(obj);
        },

        // is called when databases are connected and adapter received configuration.
        // start here!
        ready: function () {
            _ready();
        }
    });

    adapter = new utils.Adapter(options);
    
    return adapter;
};

function _unload(callback){
    try {
        adapter.log.info('cleaned everything up...');
        removeListener();
        firebase.auth().signOut().then(function() {
            adapter.log.info('signed out');
          }, function(error) {
            adapter.log.error('sign out error', error);
          });
        callback();
    } catch (e) {
        callback();
    }
    if (adapter && adapter.setState) adapter.setState('info.connection', false, true);
}

function _objectChange(id, obj) {
    if(!loggedIn){
        adapter.log.warn('You are not logged in');
        return;
    }

    adapter.log.debug('object changed id:' + id);

    // delete object
    if(obj === null){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            enumService.onObjectChange(id, obj);
        }
        stateService.objectChange(id, obj);
        if(id.indexOf('system.adapter') === 0 && (id.match(/\./g)||[]).length === 2){
            adapterService.onObjectChange(id, obj);
        }
        if(id.indexOf('system.adapter') === 0 && (id.match(/\./g)||[]).length === 3){
            instanceService.onObjectChange(id, obj);
        }
        if(id.indexOf('system.host') === 0){
            hostService.onObjectChange(id, obj);
        }
        return;
    }

    if(obj.type === "adapter"){
        adapterService.onObjectChange(id, obj);
    }

    if(obj.type === "host"){
        hostService.onObjectChange(id, obj);
    }

    if(obj.type === "instance"){
        instanceService.onObjectChange(id, obj);
    }
    
    if(obj.type === "state"){
        stateService.onObjectChange(id, obj);
    }

    if(obj.type === "state" && obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace] && obj.common.custom[adapter.namespace].enabled)
    {
        adapter.log.debug('Command added: ' + id);
        commands[id]        = obj.common.custom[adapter.namespace];
        commands[id].type   = obj.common.type;
        commands[id].states = obj.common.states;
        commands[id].alias  = getAliasName(obj);
    } else if (commands[id]) {
        adapter.log.debug('Removed command: ' + id);
        delete commands[id];
    }

    if(obj.type === "enum"){
        enumService.onObjectChange(id, obj);
        stateService.checkEnumMembers(id, obj);
    }
}

function _stateChange(id, state) {
    adapter.log.silly('state changed id:' + id);

    if(id.endsWith('.token')){
        messageService.onStateChange(id, state);
        
    }
    if(id.indexOf("iogo.") === 0 && id.endsWith('.alive')){
        calcDeviceAlive(id, state.val);
    }

    if(!loggedIn){
        return;
    }

    if(state === null){
        return;
    }

    if (state && state.ack && commands[id]) {
        adapter.log.info('send message for id:' + id);
        sendMessage(getReportStatus(id, state));
    }

    stateService.onStateChange(id, state);

    if(id.indexOf('system.adapter.') === 0 && deviceAlive === true){
        instanceService.onStateChange(id, state);
    }

    if(id.indexOf('system.hostService.') === 0){
        hostService.onStateChange(id, state);
    }

    if(id === 'admin.0.info.updatesJson'){
        adapterService.syncAvailableVersion(state.val);
    }
}

function _ready() {
    if(adapter.config.email == null || adapter.config.password == null){
        adapter.log.warn('Credentials missing, please add email and password in config!');
        return;
    }

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    firebase.initializeApp(config);
    firebase.auth().signInWithEmailAndPassword(adapter.config.email, adapter.config.password).catch(function(error) {
        adapter.log.error('Authentication: ' + error.code + ' # ' + error.message);
        return;
    });

    database = firebase.database();
    firestore = firebase.firestore();

    firebase.auth().onAuthStateChanged(function(user) {
        loggedIn = false;
        if (user) {
            if(!user.isAnonymous){
                user.getIdTokenResult().then((idTokenResult) => {
                    let licence_expiry = idTokenResult.claims.licence_expiry;
                    if(licence_expiry){
                        let expire_date = new Date(licence_expiry);
                        if(expire_date > Date.now()){
                            adapter.log.info('licence key found. licence valid until '+licence_expiry);
                            uid = user.uid;
                            adapter.log.info('logged in as: ' + uid + ' <= please keep this uid as your secret');
                            loggedIn = true;
                            initDatabase();
                            adapter.setState('info.connection', true, true);
                            adapter.subscribeForeignStates('*');
                            adapter.subscribeForeignObjects('*');
                            adapterService = new AdapterSyncService(adapter, firestore, database, uid);
                            enumService = new EnumSyncService(adapter, firestore, database, uid);
                            hostService = new HostSyncService(adapter, firestore, database, uid);
                            instanceService = new InstanceSyncService(adapter, firestore, database, uid);
                            messageService = new MessageSendService(adapter, firebase.storage(), database, uid)
                            stateService = new StateSyncService(adapter, firestore, database, uid);
                            
                            initAppDevices();
                        }else{
                            adapter.log.error('ioGo licence expired. Please upgrade your account and start instance afterwards again.');
                            setTimeout(function(){adapter.terminate('ioGo licence expired')}, 1000);
                        }
                    }else{
                        adapter.log.error('ioGo licence needed. Please upgrade your account and start instance afterwards again.');
                        setTimeout(function(){adapter.terminate('ioGo licence needed')}, 1000);
                        
                    }
                })
                .catch((error) => {
                    adapter.log.error(error);
                });
                
            }
        } else {
          // User is signed out.
          removeListener();
          adapter.setState('info.connection', false, true);
          uid = null;
        }
    });
}

function _message(obj){
    if (!obj || !obj.command) return;

    switch (obj.command) {
        case 'send':
            {
                if(!loggedIn) return;

                messageService.send(obj);
            }
    }
}

function getReportStatus(id, state) {
    adapter.log.info('getReportStatus for id:' + JSON.stringify(commands[id]));
    if (commands[id].type === 'boolean') {
        return `${commands[id].alias} => ${state.val ? commands[id].onStatus || 'ON' : commands[id].offStatus || 'OFF'}`;
    } else {
        if (commands[id].states && commands[id].states[state.val] !== undefined) {
            state.val = commands[id].states[state.val];
        }
        return `${commands[id].alias} => ${state.val}`;
    }
}

function getAliasName(obj) {
    if (obj.common.custom[adapter.namespace].alias) {
        return obj.common.custom[adapter.namespace].alias;
    } else {
        let name = obj.common.name;
        if (typeof name === 'object') {
            name = name[systemLang] || name.en;
        }
        return name || obj._id;
    }
}

function calcDeviceAlive(id, val){
    if(val !== null){
        devices[id] = val;
    }else{
        delete devices[id];
    }
    deviceAlive = false;
    Object.values(devices).forEach(value=>{
        if(value === true){
            deviceAlive = true;
        }
    });
    adapter.log.info("calcDeviceAlive is: " + deviceAlive + " all devices " + JSON.stringify(devices));
}

function initAppDevices(){
    adapter.log.info('initialize app devices')
    adapter.getStates('*.alive', function (err, states) {
        for (let id in states) {
            if(states[id] !== null){
                calcDeviceAlive(id, states[id].val);
            }
        }
    });
}

function initDatabase(){

    adapterService && adapterService.upload();
    enumService && enumService.upload();
    hostService && hostService.upload();
    instanceService && instanceService.upload();
    stateService && stateService.upload();

    initCommands();
    uploadConfig();
    registerListener();
}

function uploadConfig(){
    adapter.log.info('uploading config');
    let config = adapter.config;
    delete config.password;
    delete config.email;

    firestore.collection("users").doc(uid).collection('locations').doc("home").set(config);
}

function initCommands(){

    adapter.getForeignObjects('*', 'state', function (err, objects) {

        adapter.log.debug('uploading state start');
        for (let id in objects) {
            if(objects[id].type === "state"){
                let obj = objects[id];
                if (obj.common && obj.common.custom && obj.common.custom[adapter.namespace] && obj.common.custom[adapter.namespace].enabled) {
                    
                    commands[id] = obj.common.custom[adapter.namespace];
                    commands[id].type   = obj.common.type;
                    commands[id].states = obj.common.states;
                    commands[id].alias  = getAliasName(obj);
                    adapter.log.info('custom found for id:' + id);
                }
            }
        }

        adapter.log.debug('uploading state end');
    });
}

function registerListener(){
    
    dbDevicesRef = database.ref('devices/' + uid);
    dbDevicesRef.on('child_added',function(data){
        adapter.log.info('device update received: ' + JSON.stringify(data.val()));
        createDevice(data.key, data.val());
    });
    dbDevicesRef.on('child_changed',function(data){
        adapter.log.info('device update received: ' + JSON.stringify(data.val()));
        setDevice(data.key, data.val());
    });
    dbCommandQueuesRef = database.ref('commandQueues/' + uid);
    dbCommandQueuesRef.on('child_added',function(data){
        adapter.log.debug('command received: ' + JSON.stringify(data.val()));
        let id = data.val().id;
        let command = data.val().command;
        
        if(command == 'stopInstance'){
            adapter.log.info('stopping instance');
            adapter.getForeignObject(id,function (err, obj) {
                if (err) {
                    adapter.log.error(err);
                } else {
                    adapter.log.info(JSON.stringify(obj));
                    if(obj.common.enabled){
                        obj.common.enabled = false;  // Intanz ausschalten    
                        adapter.setForeignObject(obj._id, obj, function (err) {
                            if (err) adapter.log.error(err);
                        });
                    }else{
                        adapter.log.warn('stopInstance: instance ' + id + ' already stopped')
                    }
                }
            });
        }
        if(command == 'startInstance'){
            adapter.log.info('starting instance');
            adapter.getForeignObject(id,function (err, obj) {
                if (err) {
                    adapter.log.error(err);
                } else {
                    adapter.log.info(JSON.stringify(obj));
                    if(!obj.common.enabled){
                        obj.common.enabled = true;  // Intanz einschalten    
                        adapter.setForeignObject(obj._id, obj, function (err) {
                            if (err) adapter.log.error(err);
                        });
                    }else{
                        adapter.log.warn('startInstance: instance ' + id + ' already started')
                    }
                }
            });
        }

        dbCommandQueuesRef.child(data.ref.key).remove();
    });
}

function createDevice(id, data){
    // create device
    adapter.setObjectNotExists('iogo.0.' + id, {
        type: 'device',
        common: {
            name: data.name + ' (Device ID ' + id + ')'
        },
        native: {}
    });
    // create states
    adapter.setObjectNotExists('iogo.0.' + id + '.battery.level', {
        type: 'state',
        common: {
            name: 'battery level',
            desc: 'battery level of device ' + id,
            type: 'number',
            role: 'value.battery',
            min: 0,
            max: 100,
            unit: '%',
            read: true,
            write: false
        },
        native: {}
    }, function(err, obj) {
        if (!err && obj) {
            adapter.log.info('Objects for battery-level (' + id + ') created');
            adapter.setState('iogo.0.' + id + + '.battery.level', data.batteryLevel);
        }
    });

    adapter.setObjectNotExists('iogo.0.' + id + '.battery.charging', {
        type: 'state',
        common: {
            name: 'battery charging',
            desc: 'battery charging of device ' + id,
            type: 'boolean',
            role: 'indicator.charging',
            read: true,
            write: false
        },
        native: {}
    }, function(err, obj) {
        if (!err && obj) {
            adapter.log.info('Objects for battery-charging (' + id + ') created');
            adapter.setState('iogo.0.' + id + + '.battery.charging', data.batteryCharging);
        }
    });

    adapter.setObjectNotExists('iogo.0.' + id + '.name', {
        type: 'state',
        common: {
            name: 'device name',
            desc: 'name of device ' + id,
            type: 'string',
            role: 'info.name',
            read: true,
            write: false
        },
        native: {}
    }, function(err, obj) {
        if (!err && obj) {
            adapter.log.info('Objects for name (' + id + ') created');
            adapter.setState('iogo.0.' + id + + '.name', data.name);
        }
    });

    adapter.setObjectNotExists('iogo.0.' + id + '.token', {
        type: 'state',
        common: {
            name: 'device FCM token',
            desc: 'unique token to receive push notification to device ' + id,
            type: 'string',
            role: 'text',
            read: true,
            write: false
        },
        native: {}
    }, function(err, obj) {
        if (!err && obj) {
            adapter.log.info('Objects for token (' + id + ') created');
            adapter.setState('iogo.0.' + id + + '.token', data.token);
        }
    });

    adapter.setObjectNotExists('iogo.0.' + id + '.alive', {
        type: 'state',
        common: {
            name: 'device status',
            desc: 'indicator if device is online ' + id,
            type: 'boolean',
            role: 'info.reachable',
            read: true,
            write: false
        },
        native: {}
    }, function(err, obj) {
        if (!err && obj) {
            adapter.log.info('Objects for alive (' + id + ') created');
            adapter.setState('iogo.0.' + id + + '.alive', data.alive);
        }
    });
}

function setDevice(id, data){
    adapter.setState(id + '.name', data.name);
    adapter.setState(id + '.battery.level', data.batteryLevel);
    adapter.setState(id + '.battery.charging', data.batteryCharging);
    adapter.setState(id + '.token', data.token);
    adapter.setState(id + '.alive', data.alive);
}

function removeListener(){
    adapter.log.info('triggered listener removed');
    stateService && stateService.destroy();
    
    if(dbDevicesRef != undefined){
        dDevicesRef.off();
    }
    if(dbCommandQueuesRef != undefined){
        dbCommandQueuesRef.off();
    }
}



// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 