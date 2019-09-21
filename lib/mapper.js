'use strict';

let crypto = require('crypto');
const lang = 'en';

function getAdapterObject(id, obj){
    var tmp = {};
    let name = obj.common.name;
    if (typeof name === 'object') {
        name = name[lang] || name.en;
    }
    let desc = obj.common.desc;
    if (typeof desc === 'object') {
        desc = desc[lang] || desc.en;
    }
    let title = obj.common.titleLang;
    if (typeof title === 'object') {
        title = title[lang] || title.en;
    }
    tmp.id = id;
    tmp.name = name;
    tmp.title = title || obj.common.title;
    tmp.availableVersion = obj.common.version || 'unknown';
    tmp.installedVersion = obj.common.installedVersion || 'unknown';
    tmp.desc = desc;
    tmp.mode = obj.common.mode || 'unknown';
    if(obj.common.icon){
        tmp.icon = obj.common.icon;
    }
    if(obj.common.extIcon){
        tmp.extIcon = obj.common.extIcon;
    }
    tmp.enabled = obj.common.enabled || false;
    tmp.type = obj.common.type || 'unknown';
    tmp.ts = obj.ts;
    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function getHostObject(id, obj){
    var tmp = {};
    let name = obj.common.name;
    if (typeof name === 'object') {
        name = name[lang] || name.en;
    }
    tmp.id = id;
    tmp.name = name;
    tmp.title = obj.common.title;
    tmp.installedVersion = obj.common.installedVersion || 'unknown';
    tmp.hostname = obj.common.hostname || 'unknown';
    tmp.platform = obj.native.os.platform || 'unknown';
    tmp.totalmem = obj.native.hardware.totalmem || 0;
    tmp.type = obj.common.type || 'unknown';
    tmp.ts = obj.ts;
    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function getInstanceObject(id, obj){
    var tmp = {};
    let name = obj.common.name;
    if (typeof name === 'object') {
        name = name[lang] || name.en;
    }
    let title = obj.common.titleLang;
    if (typeof title === 'object') {
        title = title[lang] || title.en;
    }
    tmp.id = id;
    tmp.name = name;
    tmp.title = title || obj.common.title;
    tmp.loglevel = obj.common.loglevel || 'unknown';
    tmp.host = obj.common.host || 'unknown';
    if(obj.common.extIcon){
        tmp.extIcon = obj.common.extIcon;
    }
    tmp.enabled = obj.common.enabled || false;
    tmp.ts = obj.ts;
    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function getEnumObject(id, obj){
    var tmp = {};
    let name = obj.common.name;
    if (typeof name === 'object') {
        name = name[lang] || name.en;
    }
    tmp.id = id;
    tmp.name = name;
    tmp.members = obj.common.members;
    if(obj.common.icon){
        tmp.icon = obj.common.icon;
    }
    if(obj.common.color){
        tmp.color = obj.common.color;
    }
    tmp.ts = obj.ts;
    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function getStateObject(id, obj){
    var tmp = {};
    let name = obj.common.name;
    if (typeof name === 'object') {
        name = name[lang] || name.en;
    }
    tmp.name = name;
    tmp.id = id;
    tmp.type = obj.common.type || 'unknown';
    if(obj.common.min !== undefined){
        tmp.min = obj.common.min;
    }
    if(obj.common.max !== undefined){
        tmp.max = obj.common.max;
    }
    tmp.role = obj.common.role || 'text';
    if(obj.common.unit !== undefined){
        tmp.unit = obj.common.unit;
    }
    tmp.read = obj.common.read || false;
    tmp.write = obj.common.write || false;
    if(obj.common.states !== undefined){
        tmp.states = obj.common.states;
    }
    if(obj.common.custom && obj.common.custom.history0 && obj.common.custom.history0.enabled === true){
        obj.history = true;
    }else if(obj.common.custom && obj.common.custom.sql0 && obj.common.custom.sql0.enabled === true){
        obj.history = true;
    }else{
        obj.history = false;
    }
    tmp.ts = obj.ts;

    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function getState(id, state){
    var tmp = {};
    tmp.id = id;
    tmp.ack = state.ack;
    tmp.ts = state.ts;
    tmp.lc = state.lc;
    if(state.val !== null){
        tmp.val = state.val.toString();
    }else{
        tmp.val = "null";
    }

    return tmp;
}

function generateChecksum(id,object)
{   
    return id + ':' + crypto.createHash('md5').update(JSON.stringify(object)).digest("hex");
}


module.exports = {
    getAdapterObject,
    getHostObject,
    getInstanceObject,
    getEnumObject,
    getStateObject,
    getState
};