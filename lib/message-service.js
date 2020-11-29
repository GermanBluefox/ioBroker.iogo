'use strict';

let fs = require('fs');
let path = require('path');

class MessageSendService{
    constructor(adapter, storage, database, uid){
        this.adapter = adapter;
        this.storage = storage;
        this.database = database;
        this.uid = uid;

        this.lastMessageTime = 0;
        this.lastMessageText = '';
        this.users = {};

        this.stateValues = {};
        this.objectList = {};

        this._init();
    }

    _init(){
        this.adapter.getStates('*.token', (err, states) => {
            for (let id in states) {
                if(states[id] !== null){
                    let val = states[id].val;
                    let user_name = id.replace('iogo.' + this.adapter.instance + '.','').replace('.token','');
                    this.users[user_name] = val;
                    this.adapter.log.info('device ' + user_name + ' captured');
                }
            }
        });

        this.adapter.getForeignObjects('*', 'state', (err, objects) => {
            for (let id in objects) {
                let obj = objects[id];
                if (obj.common && obj.common.custom && obj.common.custom[this.adapter.namespace] && obj.common.custom[this.adapter.namespace].enabled) {
                    this.objectList[id] = obj.common.custom[this.adapter.namespace];
                    this.objectList[id].type   = obj.common.type;
                    this.objectList[id].states = obj.common.states;
                    this.objectList[id].alias  = this.getAliasName(obj);
                    this.adapter.log.info('custom found for id:' + id);
                }
            }
        });
    }

    onObjectChange(id, obj){
        if(obj === null){
            return;
        }
        
        if(obj.type === "state" 
            && obj.common 
            && obj.common.custom 
            && obj.common.custom[this.adapter.namespace] 
            && obj.common.custom[this.adapter.namespace].enabled)
        {
            if(id.indexOf('system.adapter.') === 0){
                this.adapter.log.warn('technical states are not allowed for push notification:' + id);
                return;
            }
            this.adapter.log.debug('Command added: ' + id);
            this.objectList[id]        = obj.common.custom[this.adapter.namespace];
            this.objectList[id].type   = obj.common.type;
            this.objectList[id].states = obj.common.states;
            this.objectList[id].alias  = this.getAliasName(obj);
        } else if (this.objectList[id]) {
            this.adapter.log.debug('Removed command: ' + id);
            delete this.objectList[id];
        }
    }

    onStateChange(id, state){
        if(id.endsWith('.token')){
            let user_name = id.replace('iogo.' + this.adapter.instance + '.','').replace('.token','');
            if(state){
                this.users[user_name] = state.val;
            }else{
                delete this.users[user_name];
            }
            this.adapter.log.info('user ' + user_name + ' changed');
        }

        if (state && state.ack && this.objectList[id]) {
            if(this.stateValues[id] == null || this.stateValues[id] !== state.val){
                this.stateValues[id] = state.val;

                this.adapter.log.info('send message for id:' + id);
                this.sendMessage(this.getReportStatus(id, state));
            }
        }
    }

    getReportStatus(id, state) {
        this.adapter.log.info('getReportStatus for id:' + JSON.stringify(this.objectList[id]));
        if (this.objectList[id].type === 'boolean') {
            return `${this.objectList[id].alias} => ${state.val ? this.objectList[id].onStatus || 'ON' : this.objectList[id].offStatus || 'OFF'}`;
        } else {
            if (this.objectList[id].states && this.objectList[id].states[state.val] !== undefined) {
                state.val = this.objectList[id].states[state.val];
            }
            return `${this.objectList[id].alias} => ${state.val}`;
        }
    }

    getAliasName(obj) {
        if (obj.common.custom[this.adapter.namespace].alias) {
            return obj.common.custom[this.adapter.namespace].alias;
        } else {
            let name = obj.common.name;
            if (typeof name === 'object') {
                name = name[systemLang] || name.en;
            }
            return name || obj._id;
        }
    }

    send(obj){

        // filter out double messages
        let json = JSON.stringify(obj);
        if (this.lastMessageTime && this.lastMessageText === JSON.stringify(obj) && new Date().getTime() - this.lastMessageTime < 1200) {
            this.adapter.log.debug('Filter out double message [first was for ' + (new Date().getTime() - this.lastMessageTime) + 'ms]: ' + json);
            return;
        }
    
        this.lastMessageTime = new Date().getTime();
        this.lastMessageText = json;

        this.adapter.log.info('send:' + JSON.stringify(obj));

        if (obj.message) {
            let count;
            if (typeof obj.message === 'object') {
                count = this.sendMessage(obj.message.text, obj.message.user, obj.message.title, obj.message.url, obj.message.expiry);
            } else {
                count = this.sendMessage(obj.message);
            }
            if (obj.callback) this.adapter.sendTo(obj.from, obj.command, count, obj.callback);
        }
        
    }
    
    sendMessage(text, username, title, url, expiry) {
        if (!text && text !== 0) {
            this.adapter.log.warn('Invalid text: null');
            return;
        }
    
        // convert
        if (text !== undefined && text !== null && typeof text !== 'object') {
            text = text.toString();
        }
    
        // Get a key for a new Post.
        let messageKey = this.database.ref('messageQueues/' + this.uid).push().key;
    
        if (text && (typeof text === 'string' && text.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(text) ))) {
            this.sendImage(text, messageKey).then((downloadurl) => {
                this.sendMessageToUser(null, username, title, messageKey, downloadurl, expiry)
            });
        }else if(url && (typeof url === 'string' && url.match(/\.(jpg|png|jpeg|bmp)$/i) && (fs.existsSync(url) ))) {
            this.sendImage(url, messageKey).then((downloadurl) => {
                this.sendMessageToUser(text, username, title, messageKey, downloadurl, expiry)
            });
        }else{
            this.sendMessageToUser(text, username, title, messageKey, null, expiry)
        }
    }
    
    getFilteredUsers(username){
        let arrUser = {};
    
        if (username) {
    
            let userarray = username.replace(/\s/g,'').split(',');
            let matches = 0;
            userarray.forEach((value) => {
                if (this.users[value] !== undefined) {
                    matches++;
                    arrUser[value] = this.users[value];
                }
            });
            if (userarray.length !== matches){
                this.adapter.log.warn(userarray.length - matches + ' of ' + userarray.length + ' recipients are unknown!');
            } 
            return arrUser;
        } else {
            return this.users;
        }
    }
    
    sendMessageToUser(text, username, title, messageKey, url, expiry){
        let count = 0;
        let u;
        let recipients = this.getFilteredUsers(username);
    
        for (u in recipients) {
            count += this._sendMessageHelper(this.users[u], u, text, title, messageKey, url, expiry);
        }
        return count;
    }
    
    _sendMessageHelper(token, username, text, title, messageKey, url, expiry) {
        if (!token) {
            this.adapter.log.warn('Invalid token for user: ' + username);
            return;
        }
        let count = 0;
        
        if(title === undefined || title == null){
            title = 'news';
        }
    
        this.adapter.log.debug('Send message to "' + username + '": ' + text + ' (title:' + title + ' url:' + url + ')');
    
        let mesasageData = {
            to: token,
            title: title, 
            text: text,
            url: url || null
        };
    
        this.adapter.log.info('MessageData:' + JSON.stringify(mesasageData));
    
        // Write the new post's data simultaneously in the posts list and the user's post list.
        let updates = {};
        updates['/messageQueues/' + this.uid + '/' + username + '/' + messageKey] = mesasageData;
    
        this.database.ref().update(updates, (error) => {
            if (error) {
                this.adapter.log.error(error);
            } else {
                this.adapter.log.info('message saved successfully');
            }
        });

        let msg = {
            title: title, 
            text: text,
            url: url || null,
            expiry: expiry || null,
            ts: Date.now()
        };
        
        updates['/messages/' + this.uid + '/' + username + '/' + messageKey] = msg;

        this.adapter.log.info('MessageData:' + JSON.stringify(msg));
    
        this.database.ref().update(updates, (error) => {
            if (error) {
                this.adapter.log.error(error);
            } else {
                this.adapter.log.info('message saved successfully');
            }
        });

        return count;
    }
    
    sendImage(fileName, messageKey){
        return new Promise((resolve, reject) => {
            let storageRef = this.storage.ref();
            let retUrl;
            
            retUrl = 'push_' + messageKey + '_' + new Date().getTime().toString() + path.extname(fileName);
            
            let imageRef = storageRef.child('messages').child(this.uid).child(retUrl);
    
            let file = fs.readFileSync(fileName);
            
            imageRef.put(file).then((snapshot) => {
                console.log('Uploaded a blob or file!');
            });
    
    
            let uploadTask = imageRef.put(file);
    
            // Register three observers:
            // 1. 'state_changed' observer, called any time the state changes
            // 2. Error observer, called on failure
            // 3. Completion observer, called on successful completion
            uploadTask.on('state_changed', (snapshot) => {
                // Observe state change events such as progress, pause, and resume
                // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
                let progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                this.adapter.log.debug('Upload is ' + progress + '% done');
            }, (error) => {
                this.adapter.log.error('Error: ' + JSON.stringify(error));
                reject();
            }, () => {
                // Handle successful uploads on complete
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    this.adapter.log.info('File ' + retUrl + ' uploaded');
                    resolve(downloadURL);
                });
                
            });
        });
    }

}

module.exports = MessageSendService;