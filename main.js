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
const CommandService = require('./lib/command-service');
const EnumSyncService = require('./lib/enum-service');
const DeviceService = require('./lib/device-service');
const HostSyncService = require('./lib/host-service');
const InstanceSyncService = require('./lib/instance-service');
const LocationService = require('./lib/location-service');
const MessageSendService = require('./lib/message-service');
const StateSyncService = require('./lib/state-service');

let uid;
let database;
let firestore;

let loggedIn = false;

let adapterService;
let commandService;
let enumService;
let deviceService;
let hostService;
let instanceService;
let locationService;
let messageService;
let stateService;

function startAdapter(options) {
    options = options || {};
    Object.assign(options,{
        name:  "iogo",

        unload: function (callback) {
            _unload(callback);
        },

        objectChange: function (id, obj) {
            _objectChange(id, obj)
        },

        stateChange: function(id, state){
            _stateChange(id, state)
        },

        message: function (obj) {
            _message(obj);
        },

        ready: function () {
            _ready();
        }
    });

    adapter = new utils.Adapter(options);

    return adapter;
}

function _unload(callback){
    try {
        adapter.log.info('cleaned everything up...');
        destroyServices();
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
        return;
    }

    adapter.log.debug('object changed id:' + id);

    adapterService.onObjectChange(id, obj);
    deviceService.onObjectChange(id, obj);
    enumService.onObjectChange(id, obj);
    hostService.onObjectChange(id, obj);
    instanceService.onObjectChange(id, obj);
    locationService.onObjectChange(id, obj);
    messageService.onObjectChange(id, obj);
    stateService.onObjectChange(id, obj);

    if(obj === null){
        return;
    }

}

function _stateChange(id, state) {
    if(!loggedIn || state === null){
        return;
    }

    adapter.log.silly('state changed id:' + id);

    deviceService.onStateChange(id, state);
    messageService.onStateChange(id, state);
    stateService.onStateChange(id, state);

    if(deviceService.isAlive()){
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
        if (user && !user.isAnonymous){
            user.getIdTokenResult().then((idTokenResult) => {
                let licence_expiry = idTokenResult.claims.licence_expiry;
                if(licence_expiry){
                    let expire_date = new Date(licence_expiry);
                    if(expire_date > Date.now()){
                        adapter.log.info('licence key found. licence valid until '+licence_expiry);
                        uid = user.uid;
                        adapter.log.info('logged in as: ' + uid + ' <= please keep this uid as your secret');
                        loggedIn = true;
                        initServices();
                        adapter.setState('info.connection', true, true);
                        adapter.subscribeForeignStates('*');
                        adapter.subscribeForeignObjects('*');
                    }else{
                        adapter.log.error('ioGo licence expired. Please upgrade your account and start instance afterwards again.');
                    }
                }else{
                    adapter.log.error('ioGo licence needed. Please upgrade your account and start instance afterwards again.');
                }
            })
            .catch((error) => {
                adapter.log.error(error);
            });
        } else {
          // User is signed out.
          destroyServices();
          adapter.setState('info.connection', false, true);
          uid = null;
        }
    });
}

function _message(obj){
    if (!obj || !obj.command || !loggedIn) return;

    if (obj.command === 'send') {
        messageService.send(obj);
    }
}

function initServices(){

    adapterService = new AdapterSyncService(adapter, firestore, database, uid);
    commandService = new CommandService(adapter, database, uid);
    deviceService = new DeviceService(adapter, database, uid);
    enumService = new EnumSyncService(adapter, firestore, database, uid);
    hostService = new HostSyncService(adapter, firestore, database, uid);
    instanceService = new InstanceSyncService(adapter, firestore, database, uid);
    locationService = new LocationService(adapter, firestore, database, uid);
    messageService = new MessageSendService(adapter, firebase.storage(), database, uid)
    stateService = new StateSyncService(adapter, firestore, database, uid);
}

function destroyServices(){
    adapter.log.info('triggered listener removed');

    commandService && commandService.destroy();
    deviceService && deviceService.destroy();
    stateService && stateService.destroy();
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}