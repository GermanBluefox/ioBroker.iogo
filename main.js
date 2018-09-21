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

var firebase = require("firebase");
var uid;
var database;
var dbStatesRef;
var loggedIn = false;
var enum_states = {};

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
    //adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

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
        if(isValidId(id)){
            var node = id.replace(/\./g,'_');
            
            adapter.log.debug('send state: ' + id);
            var tmp = state;
            tmp.id = id;
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
        } else{
            adapter.log.error('forbidden path: ' + id);
        }
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

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    var config = {
        apiKey: "AIzaSyBxrrLcJKMt33rPPfqssjoTgcJ3snwCO30",
        authDomain: "iobroker-iogo.firebaseapp.com",
        databaseURL: "https://iobroker-iogo.firebaseio.com",
        projectId: "iobroker-iogo",
        storageBucket: "iobroker-iogo.appspot.com",
        messagingSenderId: "1009148969935"
      };
    firebase.initializeApp(config);
    firebase.auth().signInWithEmailAndPassword(adapter.config.email, adapter.config.password).catch(function(error) {
        adapter.log.error('Authentication: ' + error.code + ' # ' + error.message);
        adapter.stop
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
    database.ref('obhects/' + uid).remove();
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
                if(id != 'enum.rooms' && id != 'enum.functions'){
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
                    objectList[node] = JSON.stringify(objects[id]);
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

function registerListener(){
    dbStatesRef = firebase.database().ref('states/' + uid);
    dbStatesRef.on('child_changed',function(data){
        adapter.log.debug('data received: ' + JSON.stringify(data));
        if(data.val().from == 'app'){
            adapter.setForeignState(data.val().id, data.val().val);
        }
    });
}

function removeListener(){
    dbStatesRef = firebase.database().ref('states/' + uid);
    dbStatesRef.off('child_changed');
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