/* jshint -W097 */
/* jshint strict:false */
/* global require */
/* global RRule */
/* global __dirname */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
var utils = require('@iobroker/adapter-core'); // Get common adapter utils
const mapper = require('./lib/mapper.js');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.iogo.0
let adapter;

var lastMessageTime = 0;
var lastMessageText = '';
var users = {};

var config = {
    apiKey: "AIzaSyBxrrLcJKMt33rPPfqssjoTgcJ3snwCO30",
    authDomain: "iobroker-iogo.firebaseapp.com",
    databaseURL: "https://iobroker-iogo.firebaseio.com",
    projectId: "iobroker-iogo",
    storageBucket: "iobroker-iogo.appspot.com",
    messagingSenderId: "1009148969935"
  };
var firebase = require("firebase");
require("firebase/storage");
global.XMLHttpRequest = require("xhr2");
var fs = require('fs');
var path = require('path');

var uid;
var database;
var firestore;
var dbStateQueuesRef;
var dbObjectQueuesRef;
var dbCommandQueuesRef;
var loggedIn = false;
var enum_states = {};
var stateValues = {}; // detect changes
var stateTypes = {};

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

    var node = getNode(id);

    // delete object
    if(obj === null){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            database.ref('enums/' + uid + '/' + node).remove();
            adapter.log.debug('object (enum) ' + id + ' removed successfully');
        }
        if(enum_states[id] === true){
            database.ref('objects/' + uid + '/' + node).remove();
            adapter.log.debug('object (state) ' + id + ' removed successfully');
        }
        return;
    }

    // update object (adapter)
    if(obj.type === "adapter"){
        var object = mapper.getAdapterObject(id, obj);

        firestore.collection('users').doc(uid).collection('adapters').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (adapter) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
    }

    // update object (host)
    if(obj.type === "host"){
        var object = mapper.getHostObject(id, obj);

        firestore.collection('users').doc(uid).collection('hosts').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (host) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
    }

    // update object (instance)
    if(obj.type === "instance"){
        var object = mapper.getInstanceObject(id, obj);

        firestore.collection('users').doc(uid).collection('instances').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (instance) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
    }
    
    // update object (state)
    if(obj.type === "state" && (enum_states[id] === true || id.indexOf('system.adapter.') === 0 || id.indexOf('system.host.') === 0)){
        var object = mapper.getStateObject(id, obj);

        database.ref('objects/' + uid + '/' + node).set(JSON.stringify(object), function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.debug('object (state) ' + id + ' saved successfully');
            }
        });

        firestore.collection('users').doc(uid).collection('states').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (state) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
    }

    // update object (enum)
    if(obj.type === "enum"){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            var object = mapper.getEnumObject(id, obj);

            for (var key in object.members) {
                enum_states[object.members[key]] = true;
            }

            database.ref('enums/' + uid + '/' + node).set(object, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug('object (enum) ' + id + ' saved successfully');
                }
            });

            firestore.collection('users').doc(uid).collection('enums').doc(node).set(object)
            .then(function() {
                adapter.log.debug('object (enum) ' + id + ' saved successfully');
            })
            .catch(function(error) {
                adapter.log.error(error);
            });
        }
    }
}

function _stateChange(id, state) {
    var node = getNode(id);

    if(id.endsWith('.token')){
        var user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
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

    if(enum_states[id] === true || id.indexOf('system.adapter.') === 0 || id.indexOf('system.host.') === 0){
        var tmp = mapper.getState(id, state);
        
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

    if(id === 'admin.0.info.updatesJson'){
        var object = JSON.parse(state.val);     

        // Get a new write batch
        var batch = firestore.batch();

        for (var name in object) {
            if (object.hasOwnProperty(name)) {
                var data = {};
                data.availableVersion = object[name].availableVersion;
                data.installedVersion = object[name].installedVersion;
                var ref = firestore.collection("users").doc(uid).collection('adapters').doc("system_adapter_" + name);
                batch.update(ref, data);
            }
        }

        // Commit the batch
        batch.commit().then(function () {
            adapter.log.info('database verions updated');
        });
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
                    var licence_expiry = idTokenResult.claims.licence_expiry;
                    if(licence_expiry){
                        var expire_date = new Date(licence_expiry);
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
        for (var id in states) {
            if(states[id] !== null){
                var val = states[id].val;
                var user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
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
    clearDatabase();
    uploadAdapter();
    uploadHost();
    uploadInstance();
    uploadEnum();
    uploadObjects();
    registerListener();
}

function clearDatabase(){
    database.ref('states/' + uid).remove();
    adapter.log.info('states from remote database removed');
}

function uploadAdapter(){
    adapter.getForeignState('admin.0.info.updatesJson', function (err, state) {
        if(err){
            adapter.log.error(err);
        }
        var valObject = JSON.parse(state.val);

        adapter.getForeignObjects('*', 'adapter', function (err, objects) {
        
            var objectList = [];
    
            for (var id in objects) {
                var node = getNode(id);
                var object = mapper.getAdapterObject(id, objects[id]);
                 
                if (valObject.hasOwnProperty(object.name)) {
                    object.availableVersion = valObject[object.name].availableVersion;
                }
                adapter.log.debug('adapter object ' + JSON.stringify(object));
                objectList[node] = object;
            }
    
            // Get a new write batch
            var batch = firestore.batch();
    
            for(var o in objectList){
                var ref = firestore.collection("users").doc(uid).collection('adapters').doc(o);
                batch.set(ref, objectList[o]);
            }
    
            // Commit the batch
            batch.commit().then(function () {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' adapters');
            });
            
        });
    });
}

function uploadHost(){
    adapter.getForeignObjects('*', 'host', function (err, objects) {
        
        var objectList = [];

        for (var id in objects) {
            var node = getNode(id);
            var object = mapper.getHostObject(id, objects[id]);
            adapter.log.debug('host object ' + JSON.stringify(object));
            objectList[node] = object;
        }

        // Get a new write batch
        var batch = firestore.batch();

        for(var o in objectList){
            var ref = firestore.collection("users").doc(uid).collection('hosts').doc(o);
            batch.set(ref, objectList[o]);
        }

        // Commit the batch
        batch.commit().then(function () {
            adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' hosts');
        });
        
    });
}

function uploadInstance(){
    adapter.getForeignObjects('*', 'instance', function (err, objects) {
        
        var objectList = [];

        for (var id in objects) {
            var node = getNode(id);
            var object = mapper.getInstanceObject(id, objects[id]);
            adapter.log.debug('instance object ' + JSON.stringify(object));
            objectList[node] = object;
        }

        // Get a new write batch
        var batch = firestore.batch();

        for(var o in objectList){
            var ref = firestore.collection("users").doc(uid).collection('instances').doc(o);
            batch.set(ref, objectList[o]);
        }

        // Commit the batch
        batch.commit().then(function () {
            adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' instances');
        });
        
    });
}

function uploadEnum(){
    adapter.getForeignObjects('*', 'enum', function (err, objects) {
        
        var objectList = [];
        
        for (var id in objects) {
            if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                var node = getNode(id);
                var object = mapper.getEnumObject(id, objects[id]);

                adapter.log.debug('enum object ' + JSON.stringify(object));
                objectList[node] = object;
                for (var key in object.members) {
                    enum_states[object.members[key]] = true;
                }
                
            }
        }

        // Get a new write batch
        var batch = firestore.batch();

        for(var o in objectList){
            var ref = firestore.collection("users").doc(uid).collection('enums').doc(o);
            batch.set(ref, objectList[o]);
        }

        // Commit the batch
        batch.commit().then(function () {
            adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' enums');
            uploadStates();
        });

    });
}

function uploadObjects(){
    adapter.getForeignObjects('*', 'state', function (err, objects) {
        var objectList = [];
        
        for (var id in objects) {
            if(objects[id].type === "state" && (enum_states[id] === true || id.indexOf('system.adapter.') === 0 || id.indexOf('system.host.') === 0)){
                var node = getNode(id);
                stateTypes[id] = objects[id].common.type;

                var object = mapper.getStateObject(id, objects[id]);
                adapter.log.debug('state object ' + JSON.stringify(object));
                objectList[node] = JSON.stringify(object);
            }
        }

        if(objectList.length > 400){
            for(var o in objectList){
                firestore.collection("users").doc(uid).collection('states').doc(o).set(objectList[o]);
            }
        }else{

            // Get a new write batch
            var batch = firestore.batch();

            for(var o in objectList){
                var ref = firestore.collection("users").doc(uid).collection('states').doc(o);
                batch.set(ref, JSON.parse(objectList[o]));
            }

            // Commit the batch
            batch.commit().then(function () {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' states');
            });
        }

    });
}

function uploadStates(){
    adapter.getForeignStates('*', function (err, states) {
        var objectList = [];

        for (var id in states) {
            if(enum_states[id] === true || id.indexOf('system.adapter.') === 0 || id.indexOf('system.host.') === 0){
                var node = getNode(id);
                
                if(states[id] != null){
                    var tmp = mapper.getState(id, states[id]);
                    
                    if(typeof states[id].val == stateTypes[id]){
                        adapter.log.warn('Value of state ' + id + ' has wrong type');
                    }
                    stateValues[id] = tmp.val;
                    objectList[node] = tmp;
                }
            }
        }
        database.ref('states/' + uid).set(objectList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' states');
            }
        });
    });
}

function registerListener(){
    dbStateQueuesRef = database.ref('stateQueues/' + uid);
    dbStateQueuesRef.on('child_added',function(data){
        adapter.log.info('state update received: ' + JSON.stringify(data));
        var id = data.val().id;
        var val = data.val().val;
        setState(id, val);
        dbStateQueuesRef.child(data.ref.key).remove();
    });
    dbObjectQueuesRef = database.ref('objectQueues/' + uid);
    dbObjectQueuesRef.on('child_added',function(data){
        adapter.log.debug('object (state) update received: ' + JSON.stringify(data.val()));
        var obj = data.val();
        var id = obj.id;
        var val = obj.val;
        delete obj.id;
        delete obj.val;
        stateTypes[id] = obj.common.type;
        
        adapter.setObject(id, obj, function(err, obj) {
            if (!err && obj){
                adapter.log.info('Object ' + id + ' created');
                if(val){
                    adapter.log.info('State ' + id + ' set to:' + val);
                    setState('iogo.0.' + id, val);
                }
            } 
        });

        dbObjectQueuesRef.child(data.ref.key).remove();
    });
    dbCommandQueuesRef = database.ref('commandQueues/' + uid);
    dbCommandQueuesRef.on('child_added',function(data){
        adapter.log.debug('command received: ' + JSON.stringify(data.val()));
        var id = data.val().id;
        var command = data.val().command;
        
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
    var newVal = val;
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

function removeListener(){
    adapter.log.info('triggered listener removed');
    if(dbStateQueuesRef != undefined){
        dbStateQueuesRef.off();
        adapter.log.info('listener removed');
    }
    if(dbObjectQueuesRef != undefined){
        dbObjectQueuesRef.off();
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
                var json = JSON.stringify(obj);
                if (lastMessageTime && lastMessageText === JSON.stringify(obj) && new Date().getTime() - lastMessageTime < 1200) {
                    adapter.log.debug('Filter out double message [first was for ' + (new Date().getTime() - lastMessageTime) + 'ms]: ' + json);
                    return;
                }
            
                lastMessageTime = new Date().getTime();
                lastMessageText = json;

                if (obj.message) {
                    var count;
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
    var messageKey = database.ref('messages/' + uid).push().key;

    if (text && (typeof text === 'string' && text.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(text) ))) {
        sendImage(text, messageKey).then(function(result){
            sendMessageToUser(null, username, title, messageKey, result, url)
        });
    }else if(url && (typeof url === 'string' && url.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(url) ))) {
        sendImage(url, messageKey).then(function(result){
            sendMessageToUser(text, username, title, messageKey, result, url)
        });
    }else{
        sendMessageToUser(text, username, title, messageKey)
    }
    
    
}

function getFilteredUsers(username){
    var arrUser = {};

    if (username) {

        var userarray = username.replace(/\s/g,'').split(',');
        var matches = 0;
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
    var count = 0;
    var u;
    var recipients = getFilteredUsers(username);

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
    var count = 0;
    
    if(title === undefined || title == null){
        title = 'news';
    }

    adapter.log.debug('Send message to "' + username + '": ' + text + ' (title:' + title + ' url:' + url + ')');

    var timestamp = new Date().getTime();

    // A message entry.
    var mesasageData = {
        to: token,
        title: title, 
        text: text,
        ts: timestamp,
        img: url || null
    };

    adapter.log.debug('MessageData:' + JSON.stringify(mesasageData));

    // Write the new post's data simultaneously in the posts list and the user's post list.
    var updates = {};
    updates['/messageQueues/' + uid + '/' + username + '/' + messageKey] = mesasageData;
    updates['/messagePushQueues/' + uid + '/' + messageKey] = mesasageData;

    if(filename != null){
        sendImage(filename, messageKey, username + '/' + url).then(function(result){
            database.ref().update(updates, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.info('message saved successfully');
                }
            });
        });
    }else{
        database.ref().update(updates, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('message saved successfully');
            }
        });
    }
    
    return count;
}

function sendImage(fileName, messageKey, uniqueName){
    return new Promise((resolve, reject) => {
        var storage = firebase.storage();
        var storageRef = storage.ref();
        var retUrl;
        
        if(uniqueName == null){
            retUrl = 'push_' + messageKey + '_' + new Date().getTime().toString() + path.extname(fileName);
        }else{
            retUrl = uniqueName;
        }
        
        var imageRef = storageRef.child('messages').child(uid).child(retUrl);

        var file = fs.readFileSync(fileName);
        
        imageRef.put(file).then(function(snapshot) {
            console.log('Uploaded a blob or file!');
        });


        var uploadTask = imageRef.put(file);

        // Register three observers:
        // 1. 'state_changed' observer, called any time the state changes
        // 2. Error observer, called on failure
        // 3. Completion observer, called on successful completion
        uploadTask.on('state_changed', function(snapshot){
            // Observe state change events such as progress, pause, and resume
            // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
            var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
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
            resolve(retUrl);
            
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