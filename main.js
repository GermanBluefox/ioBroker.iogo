/* jshint -W097 */
/* jshint strict:false */
/* global require */
/* global RRule */
/* global __dirname */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
let utils = require('@iobroker/adapter-core'); // Get common adapter utils
const mapper = require('./lib/mapper.js');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.iogo.0
let adapter;

let lastMessageTime = 0;
let lastMessageText = '';
let users = {};

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
let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

let uid;
let database;
let firestore;
let dbStateQueuesRef;
let dbDevicesRef;
let dbCommandQueuesRef;
let loggedIn = false;
let enum_states = {};
let stateValues = {};
let stateTypes = {};
let checksumMap = {};
const commands = {};

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
            main();
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

    let node = getNode(id);

    adapter.log.debug('object changed id:' + id);

    // delete object
    if(obj === null){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            firestore.collection("users").doc(uid).collection('enums').doc(node).delete();
            delete checksumMap.enumChecksumMap[node];
            firestore.collection("users").doc(uid).set(checksumMap);
            adapter.log.debug('object (enum) ' + id + ' removed successfully');
        }
        if(enum_states[id] === true){
            firestore.collection("users").doc(uid).collection('states').doc(node).delete();
            delete checksumMap.stateChecksumMap[node];
            firestore.collection("users").doc(uid).set(checksumMap);
            adapter.log.debug('object (state) ' + id + ' removed successfully');
        }
        if(id.indexOf('system.adapter') === 0 && (id.match(/\./g)||[]).length === 2){
            firestore.collection("users").doc(uid).collection('adapters').doc(node).delete();
            delete checksumMap.adapterChecksumMap[node];
            firestore.collection("users").doc(uid).set(checksumMap);
            adapter.log.debug('object (adapter) ' + id + ' removed successfully');
        }
        if(id.indexOf('system.adapter') === 0 && (id.match(/\./g)||[]).length === 3){
            firestore.collection("users").doc(uid).collection('instances').doc(node).delete();
            delete checksumMap.instanceChecksumMap[node];
            firestore.collection("users").doc(uid).set(checksumMap);
            adapter.log.debug('object (instance) ' + id + ' removed successfully');
        }
        if(id.indexOf('system.host') === 0){
            firestore.collection("users").doc(uid).collection('hosts').doc(node).delete();
            delete checksumMap.hostChecksumMap[node];
            firestore.collection("users").doc(uid).set(checksumMap);
            adapter.log.debug('object (host) ' + id + ' removed successfully');
        }
        return;
    }

    // update object (adapter)
    if(obj.type === "adapter"){
        let object = mapper.getAdapterObject(id, obj);

        firestore.collection('users').doc(uid).collection('adapters').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (adapter) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
        checksumMap.adapterChecksumMap[node] = object.checksum;
        firestore.collection("users").doc(uid).set(checksumMap);
    }

    // update object (host)
    if(obj.type === "host"){
        let object = mapper.getHostObject(id, obj);

        firestore.collection('users').doc(uid).collection('hosts').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (host) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
        checksumMap.hostChecksumMap[node] = object.checksum;
        firestore.collection("users").doc(uid).set(checksumMap);
    }

    // update object (instance)
    if(obj.type === "instance"){
        let object = mapper.getInstanceObject(id, obj);

        firestore.collection('users').doc(uid).collection('instances').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (instance) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
        checksumMap.instanceChecksumMap[node] = object.checksum;
        firestore.collection("users").doc(uid).set(checksumMap);
    }
    
    // update object (state)
    if(obj.type === "state" && enum_states[id] === true){
        let object = mapper.getStateObject(id, obj);

        firestore.collection('users').doc(uid).collection('states').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (state) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
        checksumMap.stateChecksumMap[node] = object.checksum;
        firestore.collection("users").doc(uid).set(checksumMap);
    }

    if(obj.type === "state" && obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace] && obj.common.custom[adapter.namespace].enabled)
    {
        commands[id]        = obj.common.custom[adapter.namespace];
        commands[id].type   = obj.common.type;
        commands[id].states = obj.common.states;
        commands[id].alias  = getAliasName(obj);
    } else if (commands[id]) {
        adapter.log.debug('Removed command: ' + id);
        delete commands[id];
    }

    // update object (enum)
    if(obj.type === "enum"){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            let object = mapper.getEnumObject(id, obj);

            for (let key in object.members) {
                enum_states[object.members[key]] = true;
            }

            firestore.collection('users').doc(uid).collection('enums').doc(node).set(object)
                .then(function() {
                    adapter.log.debug('object (enum) ' + id + ' saved successfully');
                })
                .catch(function(error) {
                    adapter.log.error(error);
                });
            checksumMap.enumChecksumMap[node] = object.checksum;
            firestore.collection("users").doc(uid).set(checksumMap);
        }
    }
}

function _stateChange(id, state) {
    let node = getNode(id);

    adapter.log.debug('state changed id:' + id);

    if(id.endsWith('.token')){
        let user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
        if(state){
            users[user_name] = state.val;
        }else{
            delete users[user_name];
        }
        adapter.log.info('user ' + user_name + ' changed');
    }

    if(!loggedIn){
        return;
    }

    if(state === null){
        if(enum_states[id] === true){
            database.ref('states/' + uid + '/' + node).remove();
            adapter.log.debug('state ' + id + ' removed succesfully');
        }
        return;
    }

    if(enum_states[id] === true){
        let tmp = mapper.getState(id, state);

        if (state && state.ack && commands[id]) {
            adapter.log.info('send message for id:' + id);
            sendMessage(getReportStatus(id, state));
        }
        
        if((stateValues[id] && stateValues[id] != tmp.val) || state.from.indexOf('system.adapter.iogo') !== -1){
            stateValues[id] = tmp.val;
            database.ref('states/' + uid + '/' + node).set(tmp, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug('state ' + id + ' saved successfully');
                }
            });
        }
    }

    if(id.indexOf('system.adapter.') === 0){
        let node = getNode(getInstanceFromId(id));
        let attr = id.substr(id.lastIndexOf(".")+1);
        let val = getStateVal(id, attr, state.val);

        if(val !== null){
            database.ref('instances/' + uid + '/' + node + '/' + attr).set(val, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug('instance ' + id + ' updated successfully');
                }
            });
        }
    }

    if(id.indexOf('system.host.') === 0){
        let node = getNode(getHostFromId(id));
        let attr = id.substr(id.lastIndexOf(".")+1);
        let val = getStateVal(id, attr, state.val);

        if(val !== null){
            database.ref('hosts/' + uid + '/' + node + '/' + attr).set(val, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug('host ' + id + ' updated successfully');
                }
            });
        }
    }

    if(id === 'admin.0.info.updatesJson'){
        let object = JSON.parse(state.val);     

        // Get a new write batch
        let batch = firestore.batch();

        for (let name in object) {
            if (object.hasOwnProperty(name)) {
                let data = {};
                data.availableVersion = object[name].availableVersion;
                data.installedVersion = object[name].installedVersion;
                let ref = firestore.collection("users").doc(uid).collection('adapters').doc("system_adapter_" + name);
                batch.update(ref, data);
            }
        }

        // Commit the batch
        batch.commit().then(function () {
            adapter.log.info('database verions updated');
        });
    }
}

function getStateVal(id, attr, stateVal){
    let val = null;

    if(attr === 'alive' || attr === 'connected'){
        val = stateVal;
    }
    if(attr === 'diskFree' || attr === 'diskSize' || attr === 'diskWarning' 
    || attr === 'freemem' || attr === 'memAvailable' || attr === 'memHeapTotal' || attr === 'memHeapUsed' || attr === 'memRss')
    {
        let tmpval = Math.round(parseFloat(stateVal));
        if(stateValues[id] === null || stateValues[id] != tmpval){
            val = tmpval;
            stateValues[id] = tmpval;
        }
    }

    return val;
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

function main() {
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

function initAppDevices(){
    adapter.log.info('initialize app devices')
    adapter.getStates('*.token', function (err, states) {
        for (let id in states) {
            if(states[id] !== null){
                let val = states[id].val;
                let user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
                users[user_name] = val;
                adapter.log.info('device ' + user_name + ' captured');
            }
        }
    });
}

function getNode(id){
    //replace unsupported character  . # [ ] $ /
    return id.replace(/[.#\[\]\/$]/g,'_');
}

function initDatabase(){
    let docRef = firestore.collection("users").doc(uid);
    docRef.get().then(function(doc) {
        if (doc.exists) {
            checksumMap = doc.data();
            adapter.log.info('checksummap geladen');
        } 
        initDB()
    }).catch(function(error) {
        adapter.log.error("Error getting document:", error);
        initDB()
    });
}

function initDB(){
    uploadAdapter();
    uploadHost();
    uploadInstance();
    uploadEnum();
    uploadStates();
    registerListener();
}

function uploadAdapter(){
    adapter.getForeignState('admin.0.info.updatesJson', function (err, state) {
        if(err){
            adapter.log.error(err);
        }
        let valObject = JSON.parse(state.val);

        adapter.log.info('uploading adapter');

        adapter.getForeignObjects('*', 'adapter', function (err, objects) {
        
            adapter.log.debug('uploading adapter start');

            let remoteChecksumMap = checksumMap.adapterChecksumMap || {};
            let dbRef = firestore.collection("users").doc(uid).collection('adapters');
            let allObjects = [];
    
            for (let id in objects) {
                let node = getNode(id);
                let object = mapper.getAdapterObject(id, objects[id]);
                allObjects[node] = true;
                if (valObject.hasOwnProperty(object.name)) {
                    object.availableVersion = valObject[object.name].availableVersion;
                }
                let checksum = object.checksum;
                if(checksum != remoteChecksumMap[node]){
                    adapter.log.debug('uploading adapter: ' + node);
                    dbRef.doc(node).set(object);
                    remoteChecksumMap[node] = checksum;
                }
            }
    
            for(let x in remoteChecksumMap){
                if(allObjects[x] == null){
                    dbRef.doc(x).delete();
                    delete remoteChecksumMap[x];
                }
            }
            
            checksumMap.adapterChecksumMap = remoteChecksumMap;
            firestore.collection("users").doc(uid).set(checksumMap);
            
            adapter.log.debug('uploading adapter end');
        });
    });
}

function uploadHost(){

    adapter.log.info('uploading host');

    adapter.getForeignObjects('*', 'host', function (err, objects) {
        
        adapter.log.debug('uploading host start');

        let remoteChecksumMap = checksumMap.hostChecksumMap || {};
        let dbRef = firestore.collection("users").doc(uid).collection('hosts');
        let allObjects = [];

        for (let id in objects) {
            let node = getNode(id);
            let object = mapper.getHostObject(id, objects[id]);
            allObjects[node] = true;
            let checksum = object.checksum;
            if(checksum != remoteChecksumMap[node]){
                adapter.log.debug('uploading host: ' + node);
                dbRef.doc(node).set(object);
                remoteChecksumMap[node] = checksum;
            }
        }

        for(let x in remoteChecksumMap){
            if(allObjects[x] == null){
                dbRef.doc(x).delete();
                delete remoteChecksumMap[x];
            }
        }
        
        checksumMap.hostChecksumMap = remoteChecksumMap;
        firestore.collection("users").doc(uid).set(checksumMap);

        adapter.log.debug('uploading host end');
    });
}

function uploadInstance(){

    adapter.log.info('uploading instance');

    adapter.getForeignObjects('*', 'instance', function (err, objects) {
        
        adapter.log.debug('uploading instance start');

        let remoteChecksumMap = checksumMap.instanceChecksumMap || {};
        let dbRef = firestore.collection("users").doc(uid).collection('instances');
        let allObjects = [];

        for (let id in objects) {
            let node = getNode(id);
            let object = mapper.getInstanceObject(id, objects[id]);
            allObjects[node] = true;
            let checksum = object.checksum;
            if(checksum != remoteChecksumMap[node]){
                adapter.log.debug('uploading instance: ' + node);
                dbRef.doc(node).set(object);
                remoteChecksumMap[node] = checksum;
            }
        }

        for(let x in remoteChecksumMap){
            if(allObjects[x] == null){
                dbRef.doc(x).delete();
                delete remoteChecksumMap[x];
            }
        }
        
        checksumMap.instanceChecksumMap = remoteChecksumMap;
        firestore.collection("users").doc(uid).set(checksumMap);

        adapter.log.debug('uploading instance end');
    });
}

function uploadEnum(){

    adapter.log.info('uploading enum');

    adapter.getForeignObjects('*', 'enum', function (err, objects) {
        
        adapter.log.debug('uploading enum start');

        let allEnums = [];
        let enumChecksumMap = checksumMap.enumChecksumMap || {};
        let enumRef = firestore.collection("users").doc(uid).collection('enums');
        
        for (let id in objects) {
            if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                let node = getNode(id);
                let object = mapper.getEnumObject(id, objects[id]);
                let checksum = object.checksum;
                allEnums[node] = true;
                if(checksum != enumChecksumMap[node]){
                    adapter.log.debug('uploading enum: ' + node);
                    enumRef.doc(node).set(object);
                    enumChecksumMap[node] = checksum;
                }
                for (let key in object.members) {
                    enum_states[object.members[key]] = true;
                }
            }
        }

        for(let x in enumChecksumMap){
            if(allEnums[x] == null){
                enumRef.doc(x).delete();
                delete enumChecksumMap[x];
            }
        }
        
        checksumMap.enumChecksumMap = enumChecksumMap;
        firestore.collection("users").doc(uid).set(checksumMap);

        adapter.log.debug('uploading enum end');

        uploadValues();
    });
}

function uploadStates(){

    adapter.log.info('uploading state');

    adapter.getForeignObjects('*', 'state', function (err, objects) {

        adapter.log.debug('uploading state start');

        let remoteChecksumMap = checksumMap.stateChecksumMap || {};
        let dbRef = firestore.collection("users").doc(uid).collection('states');
        let allObjects = [];

        for (let id in objects) {
            if(objects[id].type === "state" && enum_states[id] === true){
                let obj = objects[id];
                if (obj.common && obj.common.custom && obj.common.custom[adapter.namespace] && obj.common.custom[adapter.namespace].enabled) {
                    commands[id] = obj.common.custom[adapter.namespace];
                    commands[id].type   = obj.common.type;
                    commands[id].states = obj.common.states;
                    commands[id].alias  = getAliasName(obj);
                    adapter.log.info('custom found for id:' + id);
                }
                stateTypes[id] = objects[id].common.type;
                let node = getNode(id);
                let object = mapper.getStateObject(id, objects[id]);
                allObjects[node] = true;
                let checksum = object.checksum;
                if(checksum != remoteChecksumMap[node]){
                    adapter.log.debug('uploading state: ' + node);
                    dbRef.doc(node).set(object);
                    remoteChecksumMap[node] = checksum;
                }
            }
        }

        for(let x in remoteChecksumMap){
            if(allObjects[x] == null){
                dbRef.doc(x).delete();
                delete remoteChecksumMap[x];
            }
        }
        
        checksumMap.stateChecksumMap = remoteChecksumMap;
        firestore.collection("users").doc(uid).set(checksumMap);

        adapter.log.debug('uploading state end');
    });
}

function getInstanceFromId(id){
    let tmp = id.substr(15);
    tmp = tmp.substr(0, tmp.lastIndexOf('.'));
    return tmp;
}

function getHostFromId(id){
    let tmp = id.substr(12);
    tmp = tmp.substr(0, tmp.lastIndexOf('.'));
    return tmp;
}

function uploadValues(){

    adapter.log.info('uploading values');

    adapter.getForeignStates('*', function (err, states) {
        adapter.log.debug('uploading values start');

        let objectList = [];
        let instanceList = [];
        let hostList = [];

        for (let id in states) {
            
            if(enum_states[id] === true){
                let node = getNode(id);
                if(states[id] != null){
                    let tmp = mapper.getState(id, states[id]);
                    
                    if(typeof states[id].val != stateTypes[id]){
                        adapter.log.warn('Value of state ' + id + ' has wrong type');
                    }
                    stateValues[id] = tmp.val;
                    objectList[node] = tmp;
                }
            }
            if(id.indexOf('system.adapter.') === 0 && id.lastIndexOf('upload') === -1){
                let node = getNode(getInstanceFromId(id));
                if(states[id] != null){
                    if(instanceList[node] === undefined){
                        instanceList[node] = {};
                    }
                    if(instanceList[node]['id'] === undefined){
                        instanceList[node]['id'] = 'system.adapter.' + getInstanceFromId(id);
                    }
                    let attr = id.substr(id.lastIndexOf(".")+1);
                    let val = getStateVal(id, attr, states[id].val);
                    if(val !== null){
                        instanceList[node][attr] = val;
                    }
                }
            }
            if(id.indexOf('system.host.') === 0){
                let node = getNode(getHostFromId(id));
                if(states[id] != null){
                    if(hostList[node] === undefined){
                        hostList[node] = {};
                    }
                    if(hostList[node]['id'] === undefined){
                        hostList[node]['id'] = 'system.host.' + getHostFromId(id);
                    }
                    let attr = id.substr(id.lastIndexOf(".")+1);
                    let val = getStateVal(id, attr, states[id].val);
                    if(val !== null){
                        hostList[node][attr] = val;
                    }
                }
            }
        }

        adapter.log.debug('uploading state values');
        database.ref('states/' + uid).set(objectList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' state values');
            }
        });
        
        adapter.log.debug('uploading instance values');
        database.ref('instances/' + uid).set(instanceList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(instanceList).length + ' instance values');
            }
        });

        adapter.log.debug('uploading host values');
        database.ref('hosts/' + uid).set(hostList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(hostList).length + ' host values');
            }
        });
        
        adapter.log.debug('uploading values end');
    });
}

function registerListener(){
    dbStateQueuesRef = database.ref('stateQueues/' + uid);
    dbStateQueuesRef.on('child_added',function(data){
        adapter.log.info('state update received: ' + JSON.stringify(data.val()));
        let id = data.val().id;
        let val = data.val().val;
        setState(id, val);
        dbStateQueuesRef.child(data.ref.key).remove();
    });
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

function setState(id, val){
    let newVal = val;
    if(stateTypes[id] == "number"){
        newVal = parseFloat(val);
    }else if(stateTypes[id] == "boolean"){
        newVal = (val == "true");
    }
    if(id.indexOf('iogo.') === 1){
        adapter.setState(id, newVal);
    }else{
        adapter.setForeignState(id, newVal);
    }
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
    if(dbStateQueuesRef != undefined){
        dbStateQueuesRef.off();
    }
    if(dbDevicesRef != undefined){
        dDevicesRef.off();
    }
    if(dbCommandQueuesRef != undefined){
        dbCommandQueuesRef.off();
    }
}

function _message(obj){
    if (!obj || !obj.command) return;

    switch (obj.command) {
        case 'send':
            {
                if(!loggedIn) return;

                // filter out double messages
                let json = JSON.stringify(obj);
                if (lastMessageTime && lastMessageText === JSON.stringify(obj) && new Date().getTime() - lastMessageTime < 1200) {
                    adapter.log.debug('Filter out double message [first was for ' + (new Date().getTime() - lastMessageTime) + 'ms]: ' + json);
                    return;
                }
            
                lastMessageTime = new Date().getTime();
                lastMessageText = json;

                if (obj.message) {
                    let count;
                    if (typeof obj.message === 'object') {
                        count = sendMessage(obj.message.text, obj.message.user, obj.message.title, obj.message.url);
                    } else {
                        count = sendMessage(obj.message);
                    }
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, count, obj.callback);
                }
            }
    }
}

function sendMessage(text, username, title, url) {
    if (!text && text !== 0) {
        adapter.log.warn('Invalid text: null');
        return;
    }

    // convert
    if (text !== undefined && text !== null && typeof text !== 'object') {
        text = text.toString();
    }

    // Get a key for a new Post.
    let messageKey = database.ref('messageQueues/' + uid).push().key;

    if (text && (typeof text === 'string' && text.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(text) ))) {
        sendImage(text, messageKey).then(function(downloadurl){
            sendMessageToUser(null, username, title, messageKey, downloadurl, text)
        });
    }else if(url && (typeof url === 'string' && url.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(url) ))) {
        sendImage(url, messageKey).then(function(downloadurl){
            sendMessageToUser(text, username, title, messageKey, downloadurl, url)
        });
    }else{
        sendMessageToUser(text, username, title, messageKey)
    }
}

function getFilteredUsers(username){
    let arrUser = {};

    if (username) {

        let userarray = username.replace(/\s/g,'').split(',');
        let matches = 0;
        userarray.forEach(function (value) {
            if (users[value] !== undefined) {
                matches++;
                arrUser[value] = users[value];
            }
        });
        if (userarray.length != matches) adapter.log.warn(userarray.length - matches + ' of ' + userarray.length + ' recipients are unknown!');
        return arrUser;
    } else {
        return users;
    }
}

function sendMessageToUser(text, username, title, messageKey, url, filename){
    let count = 0;
    let u;
    let recipients = getFilteredUsers(username);

    for (u in recipients) {
        count += _sendMessageHelper(users[u], u, text, title, messageKey, url, filename);
    }
    return count;
}

function _sendMessageHelper(token, username, text, title, messageKey, url, filename) {
    if (!token) {
        adapter.log.warn('Invalid token for user: ' + username);
        return;
    }
    let count = 0;
    
    if(title === undefined || title == null){
        title = 'news';
    }

    adapter.log.debug('Send message to "' + username + '": ' + text + ' (title:' + title + ' url:' + url + ')');

    let timestamp = new Date().getTime();

    // A message entry.
    let mesasageData = {
        to: token,
        title: title, 
        text: text,
        ts: timestamp,
        url: url || null
    };

    if(url !== undefined){
        mesasageData.img = 'push_' + messageKey + '_' + new Date().getTime().toString() + path.extname(filename);
    }

    adapter.log.info('MessageData:' + JSON.stringify(mesasageData));

    // Write the new post's data simultaneously in the posts list and the user's post list.
    let updates = {};
    updates['/messageQueues/' + uid + '/' + username + '/' + messageKey] = mesasageData;

    database.ref().update(updates, function(error) {
        if (error) {
            adapter.log.error(error);
        } else {
            adapter.log.info('message saved successfully');
        }
    });
    
    return count;
}

function sendImage(fileName, messageKey){
    return new Promise((resolve, reject) => {
        let storage = firebase.storage();
        let storageRef = storage.ref();
        let retUrl;
        
        retUrl = 'push_' + messageKey + '_' + new Date().getTime().toString() + path.extname(fileName);
        
        let imageRef = storageRef.child('messages').child(uid).child(retUrl);

        let file = fs.readFileSync(fileName);
        
        imageRef.put(file).then(function(snapshot) {
            console.log('Uploaded a blob or file!');
        });


        let uploadTask = imageRef.put(file);

        // Register three observers:
        // 1. 'state_changed' observer, called any time the state changes
        // 2. Error observer, called on failure
        // 3. Completion observer, called on successful completion
        uploadTask.on('state_changed', function(snapshot){
            // Observe state change events such as progress, pause, and resume
            // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
            let progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            adapter.log.debug('Upload is ' + progress + '% done');
            switch (snapshot.state) {
            case firebase.storage.TaskState.PAUSED: // or 'paused'
                adapter.log.debug('Upload is paused');
                break;
            case firebase.storage.TaskState.RUNNING: // or 'running'
                adapter.log.debug('Upload is running');
                break;
            }
        }, function(error) {
            adapter.log.error('Error: ' + JSON.stringify(error));
            reject();
        }, function() {
            // Handle successful uploads on complete
            uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                adapter.log.info('File ' + retUrl + ' uploaded');
                resolve(downloadURL);
            });
            
        });
    });
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 