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

/*Variable declaration, since ES6 there are let to declare variables. Let has a more clearer definition where 
it is available then var.The variable is available inside a block and it's childs, but not outside. 
You can define the same variable name inside a child without produce a conflict with the variable of the parent block.*/
var lastMessageTime = 0;
var lastMessageText = '';
var users = {};
var firebase = require("firebase");
var uid;
var database;
var loggedIn = false;

var config = {
    apiKey: "AIzaSyBxrrLcJKMt33rPPfqssjoTgcJ3snwCO30",
    authDomain: "iobroker-iogo.firebaseapp.com",
    databaseURL: "https://iobroker-iogo.firebaseio.com",
    projectId: "iobroker-iogo",
    storageBucket: "iobroker-iogo.appspot.com",
    messagingSenderId: "1009148969935"
  };

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    if(id.endsWith('.token')){
        var user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
        if(state){
            users[user_name] = state.val;
        }else{
            delete users[user_name];
        }
        adapter.log.info('user ' + user_name + ' changed');
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
    firebase.initializeApp(config);
    if(adapter.config.email == null){
        adapter.log.error('Config email is null');
        return;
    }
    if(adapter.config.password == null){
        adapter.log.error('Config password is null');
        return;
    }
    firebase.auth().signInWithEmailAndPassword(adapter.config.email, adapter.config.password).catch(function(error) {
        adapter.log.error('Authentication: ' + error.code + ' # ' + error.message);
        return;
      });
    firebase.auth().onAuthStateChanged(function(user) {
        loggedIn = false;
        if (user) {
            // User is signed in.
            if(!user.isAnonymous){
                uid = user.uid;
                adapter.log.info('logged in as:' + uid);
                loggedIn = true;
            }
        } else {
          // User is signed out.
          adapter.log.warn('logged out as:' + uid);
          uid = null;
          users = {};
          return;
        }
    });
    database = firebase.database();

    // in this iogo all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    adapter.getStates('*.token', function (err, states) {
        for (var id in states) {
            if(staes[id] != null && states[id].val != null){
                adapter.log.debug('"' + id + '" = "' + states[id].val);
                var user_name = id.replace('iogo.'+adapter.instance+'.','').replace('.token','');
                users[user_name] = states[id].val;
                adapter.log.info('user ' + user_name + ' captured');
            }
        }
    });
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

    adapter.log.info('database.ref:' + 'messages/' + uid);
    database.ref('messages/' + uid).push(mesasageData, function(error) {
        if (error) {
            adapter.log.error(error);
        } else {
            adapter.log.info('saved successfully');
        }
    });

    return count;
}