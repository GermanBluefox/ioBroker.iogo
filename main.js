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

var config = {
    apiKey: "AIzaSyBxrrLcJKMt33rPPfqssjoTgcJ3snwCO30",
    authDomain: "iobroker-iogo.firebaseapp.com",
    databaseURL: "https://iobroker-iogo.firebaseio.com",
    projectId: "iobroker-iogo",
    storageBucket: "iobroker-iogo.appspot.com",
    messagingSenderId: "1009148969935"
  };
var firebase = require("firebase");
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
        } else{
            adapter.log.error('forbidden path: ' + id);
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
                uid = user.uid;
                adapter.log.info('logged in as: ' + uid);
                loggedIn = true;
                adapter.setState('info.connection', true, true);
                clearDatabase();
                uploadEnum();
                uploadObjects();
                uploadStates();
                registerListener();
            }
        } else {
          // User is signed out.
          removeListener();
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
    return (id.indexOf('#') === -1 && id.indexOf('$') === -1 && id.indexOf('[') === -1 && id.indexOf(']') === -1 && id.indexOf('/') === -1)
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
                if(id.indexOf('enum.rooms.') === 1 || id.indexOf('enum.functions.')){
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
                    if(tmp.common.icon){
                        object.icon = tmp.common.icon;
                    }
                    if(tmp.common.color){
                        object.color = tmp.common.color;
                    }
                    objectList[node] = object;
                    for (var key in object.members) {
                        enum_states[object.members[key]] = true;
                    }
                }
            } else{
                adapter.log.error('forbidden path: ' + id);
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
                    tmp.id = id;
                    if(states[id].val !== null){
                        tmp.val = states[id].val.toString();
                    }
                    
                    //stateValues[id] = states[id].val;
                    objectList[node] = tmp;
                } else{
                    adapter.log.error('forbidden path: ' + id);
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
        tmp.val = state.val;
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
    } else{
        adapter.log.error('forbidden path: ' + id);
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
                        count = sendMessage(obj.message.text, obj.message.user, obj.message);
                    } else {
                        count = sendMessage(obj.message);
                    }
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, count, obj.callback);
                }
            }
    }
}

function sendMessage(text, username, options) {
    if (!text && (typeof options !== 'object')) {
        if (!text && text !== 0 && !options) {
            adapter.log.warn('Invalid text: null');
            return;
        }
    }

    // convert
    if (text !== undefined && text !== null && typeof text !== 'object') {
        text = text.toString();
    }

    var count = 0;
    var u;

    if (username) {

        var userarray = username.replace(/\s/g,'').split(',');
        var matches = 0;
        userarray.forEach(function (value) {
            if (users[value] !== undefined) {
                matches++;
                count += _sendMessageHelper(users[value], value, text, options);
            }
        });
        if (userarray.length != matches) adapter.log.warn(userarray.length - matches + ' of ' + userarray.length + ' recipients are unknown!');
        return count;
    } else {

        for (u in users) {
            count += _sendMessageHelper(users[u], u, text, options);
        }
    }
    return count;
}

function _sendMessageHelper(token, username, text, options) {
    if (!token) {
        adapter.log.warn('Invalid token for user: '+username);
        return;
    }
    var count = 0;
    var priority = 'normal';
    var title = 'news';
    if (options) {
        if(options.priority !== undefined){
            priority = options.priority;
        }
        if(options.title !== undefined){
            title = options.title;
        }
    }

    adapter.log.debug('Send message to "' + username + '": ' + text + ' (priority:'+priority+' / title:'+title+') token:'+ token);

    // A message entry.
    var mesasageData = {
        to: token,
        priority: priority,
        title: title, 
        body: text
    };

    database.ref('messages/' + uid).push(mesasageData, function(error) {
        if (error) {
            adapter.log.error(error);
        } else {
            adapter.log.info('saved successfully');
        }
    });

    return count;
}

function sendImage(fileName){

    var storage = firebase.storage();
    var storageRef = storage.ref();
    var imageRef = storageRef.child('messages').child('PWymFluqjSPMAFGVxYKc2Olb7Pm1').child(path.basename(fileName));

    var file = fs.readFileSync(fileName);
    var uploadTask = imageRef.put(file);

    // Base64 formatted string
    //var message = 'data:image/png,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';
    //var uploadTask = imageRef.putString(message, 'data_url');

    // Register three observers:
    // 1. 'state_changed' observer, called any time the state changes
    // 2. Error observer, called on failure
    // 3. Completion observer, called on successful completion
    uploadTask.on('state_changed', function(snapshot){
        // Observe state change events such as progress, pause, and resume
        // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
        var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload is ' + progress + '% done');
        switch (snapshot.state) {
        case firebase.storage.TaskState.PAUSED: // or 'paused'
            console.log('Upload is paused');
            break;
        case firebase.storage.TaskState.RUNNING: // or 'running'
            console.log('Upload is running');
            break;
        }
    }, function(error) {
        console.log('Error: ' + JSON.stringify(error));
    }, function() {
        // Handle successful uploads on complete
        // For instance, get the download URL: https://firebasestorage.googleapis.com/...
        uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
        console.log('File available at', downloadURL);
        });
    });

    return path.basename(fileName);
}