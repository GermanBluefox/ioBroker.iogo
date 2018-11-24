/**
 *
 * iogo adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.iogo.0
const adapter = new utils.Adapter('iogo');

var lastMessageTime = 0;
var lastMessageText = '';
var users = {};
var iogoPro = false;

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
var dbStateQueuesRef;
var dbObjectQueuesRef;
var loggedIn = false;
var enum_states = {};
//var stateValues = {}; // detect changes
var stateTypes = {};

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
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
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    if(!loggedIn){
        return;
    }
    
    if(enum_states[id] === true && obj.type === "state"){
        if(isValidId(id)){
            var node = id.replace(/\./g,'_');
            
            adapter.log.debug('send object: ' + id);
            database.ref('objects/' + uid + '/' + node).set(JSON.stringify(obj), function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug(id + ' saved successfully');
                }
            });
        }
    }
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted

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

    if(enum_states[id] === true){
        sendState(id, state);
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    send(obj);
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

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

    firebase.auth().onAuthStateChanged(function(user) {
        loggedIn = false;
        if (user) {
            if(!user.isAnonymous){
                user.getIdTokenResult().then((idTokenResult) => {
                    iogoPro = idTokenResult.claims.pro;
                    if(iogoPro){
                        adapter.log.info('PRO features enabled');
                    }
                    initDatabase();
                })
                .catch((error) => {
                    adapter.log.error(error);
                });
                uid = user.uid;
                adapter.log.info('logged in as: ' + uid);
                loggedIn = true;
                adapter.setState('info.connection', true, true);
            }
        } else {
          // User is signed out.
          removeListener();
          adapter.setState('info.connection', false, true);
          uid = null;
        }
    });

    adapter.subscribeForeignStates('*');
    adapter.subscribeForeignObjects('*');
    
    initAppDevices();
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

function isValidId(id){
    if((id.indexOf('#') === -1 && id.indexOf('$') === -1 && id.indexOf('[') === -1 && id.indexOf(']') === -1 && id.indexOf('/') === -1)){
        return true;
    }else{
        adapter.log.error('forbidden path: ' + id);
        return false;
    }
}

function initDatabase(){
    clearDatabase();
    uploadEnum();
    uploadObjects();
    uploadStates();
    registerListener();
}

function clearDatabase(){
    database.ref('states/' + uid).remove();
    adapter.log.info('removed states from remote database');
    database.ref('objects/' + uid).remove();
    adapter.log.info('removed objects from remote database');
    database.ref('enums/' + uid).remove();
    adapter.log.info('removed enums from remote database');
}

function uploadEnum(){
    adapter.getForeignObjects('*', 'enum', function (err, objects) {
        const lang = 'en';
        var objectList = [];
        
        for (var id in objects) {
            if(isValidId(id)){
                if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                    var node = id.replace(/\./g,'_');
                    var object = {};
                    var tmp = objects[id];
                    let name = tmp.common.name;
                    if (typeof name === 'object') {
                        name = name[lang] || name.en;
                    }
                    object.id = id;
                    object.name = name;
                    object.members = tmp.common.members;
                    if(iogoPro){
                        if(tmp.common.icon){
                            object.icon = tmp.common.icon;
                        }
                        if(tmp.common.color){
                            object.color = tmp.common.color;
                        }
                    }
                    objectList[node] = object;
                    for (var key in object.members) {
                        enum_states[object.members[key]] = true;
                    }
                }
            }
        }
        
        database.ref('enums/' + uid).set(objectList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' enums');
            }
        });
    });
}

function uploadObjects(){
    adapter.getForeignObjects('*', 'state', function (err, objects) {
        var objectList = [];
        
        for (var id in objects) {
            if(enum_states[id] === true && objects[id].type === "state"){
                if(isValidId(id)){
                    var node = id.replace(/\./g,'_');
                    stateTypes[id] = objects[id].common.type;

                    var tmp = objects[id];
                    delete tmp.native;

                    objectList[node] = JSON.stringify(tmp);
                } else{
                    adapter.log.error('forbidden path: ' + id);
                }
            }
        }

        database.ref('objects/' + uid).set(objectList, function(error) {
            if (error) {
                adapter.log.error(error);
            } else {
                adapter.log.info('database initialized with ' + Object.keys(objectList).length + ' objects');
            }
        });
    });
}

function uploadStates(){
    adapter.getForeignStates('*', function (err, states) {
        var objectList = [];

        for (var id in states) {
            if(enum_states[id] === true){
                if(isValidId(id)){
                    var node = id.replace(/\./g,'_');
                    
                    var tmp = states[id];
                    if(tmp != null){
                        tmp.id = id;
                        if(states[id].val !== null){
                            tmp.val = states[id].val.toString();
                        }
                        
                        //stateValues[id] = states[id].val;
                        objectList[node] = tmp;
                    }
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

function sendState(id, state){
    if(isValidId(id)){
        var node = id.replace(/\./g,'_');
        
        adapter.log.debug('send state: ' + id);
        var tmp = {};
        tmp.id = id;
        tmp.ack = state.ack;
        if(iogoPro){
            tmp.val = state.val;
        }else if(typeof state.val === 'string'){
            tmp.val = state.val.substr(1,100);
        }
        tmp.ts = state.ts;
        tmp.lc = state.lc;
        //if(stateValues[id] && stateValues[id] != state.val){
        //    stateValues[id] = state.val;
            if(state.val !== null){
                tmp.val = state.val.toString();
            }
            database.ref('states/' + uid + '/' + node).set(tmp, function(error) {
                if (error) {
                    adapter.log.error(error);
                } else {
                    adapter.log.debug(id + ' saved successfully');
                }
            });
        //}
    }
}

function registerListener(){
    dbStateQueuesRef = firebase.database().ref('stateQueues/' + uid);
    dbStateQueuesRef.on('child_added',function(data){
        adapter.log.debug('data received: ' + JSON.stringify(data));
        var id = data.val().id;
        var val = data.val().val;
        setState(id, val);
        dbStateQueuesRef.child(data.ref.key).remove();
    });
    dbObjectQueuesRef = firebase.database().ref('objectQueues/' + uid);
    dbObjectQueuesRef.on('child_added',function(data){
        adapter.log.debug('data received: ' + JSON.stringify(data.val()));
        var obj = data.val();
        var id = obj.id;
        var val = obj.val;
        delete obj.id;
        delete obj.val;
        stateTypes[id] = obj.common.type;
        adapter.log.debug('data received type: ' + obj.common.type);
        
        adapter.setObjectNotExists(id, obj, function(err, obj) {
            if (!err && obj){
                adapter.log.info('Object ' + obj.id + ' created');
                if(val){
                    setState('iogo.0.' + id, val);
                }
            } 
        });

        dbObjectQueuesRef.child(data.ref.key).remove();
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
    if(dbStateQueuesRef != undefined){
        dbStateQueuesRef.off();
    }
    if(dbObjectQueuesRef != undefined){
        dbObjectQueuesRef.off();
    }
}

function send(obj){
    if (!obj || !obj.command) return;
    if(!loggedIn) return;

    // filter out double messages
    var json = JSON.stringify(obj);
    if (lastMessageTime && lastMessageText === JSON.stringify(obj) && new Date().getTime() - lastMessageTime < 1200) {
        adapter.log.debug('Filter out double message [first was for ' + (new Date().getTime() - lastMessageTime) + 'ms]: ' + json);
        return;
    }

    lastMessageTime = new Date().getTime();
    lastMessageText = json;

    switch (obj.command) {
        case 'send':
            {
                if (obj.message) {
                    var count;
                    if (typeof obj.message === 'object') {
                        count = sendMessage(obj.message.text, obj.message.user, obj.message.priority, obj.message.title, obj.message.url);
                    } else {
                        count = sendMessage(obj.message);
                    }
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, count, obj.callback);
                }
            }
    }
}

function sendMessage(text, username, priority, title, url) {
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

    if (iogoPro && text && (typeof text === 'string' && text.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(text) ))) {
        sendImage(text).then(function(url){
            sendMessageToUser(null, username, priority, title, messageKey, url)
        });
    }else if(iogoPro && url && (typeof url === 'string' && url.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(url) ))) {
        sendImage(url).then(function(fileName){
            sendMessageToUser(text, username, priority, title, messageKey, fileName)
        });
    }else{
        sendMessageToUser(text, username, priority, title, messageKey)
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

function sendMessageToUser(text, username, priority, title, messageKey, url){
    var count = 0;
    var u;
    var recipients = getFilteredUsers(username);

    for (u in recipients) {
        count += _sendMessageHelper(users[u], u, text, priority, title, messageKey, url);
    }
    return count;
}

function _sendMessageHelper(token, username, text, priority, title, messageKey, url) {
    if (!token) {
        adapter.log.warn('Invalid token for user: '+username);
        return;
    }
    var count = 0;
    
    if(priority === undefined || priority == null){
        priority = 'normal';
    }
    if(title === undefined || title == null){
        title = 'news';
    }

    adapter.log.debug('Send message to "' + username + '": ' + text + ' (priority:' + priority + ' / title:' + title + ') url:' + url);

    var timestamp = new Date().getTime();

    // A message entry.
    var mesasageData = {
        to: token,
        priority: priority,
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

    database.ref().update(updates, function(error) {
        if (error) {
            adapter.log.error(error);
        } else {
            adapter.log.info('saved successfully');
        }
    });

    return count;
}

function sendImage(fileName, messageKey){
    return new Promise((resolve, reject) => {
        var storage = firebase.storage();
        var storageRef = storage.ref();
        var imageRef = storageRef.child('messages').child(uid).child(messageKey).child(path.basename(fileName));

        var file = fs.readFileSync(fileName);
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
            uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                resolve(messageKey + '/' + path.basename(fileName));
            });
        });
    });
}