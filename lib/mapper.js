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
    tmp.desc = desc || 'unknown';
    tmp.mode = obj.common.mode || 'unknown';
    if(obj.common.icon){
        tmp.icon = obj.common.icon;
    }
    if(obj.common.extIcon){
        tmp.extIcon = obj.common.extIcon;
    }
    tmp.enabled = obj.common.enabled || false;
    tmp.type = obj.common.type || 'unknown';
    tmp.ts = obj.ts || null;
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
    tmp.ts = obj.ts || null;
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
    tmp.ts = obj.ts || null;
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
    tmp.ts = obj.ts || null;
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
    if(obj.common.min !== undefined && typeof obj.common.min === 'number'){
        tmp.min = parseFloat(obj.common.min);
    }
    if(obj.common.max !== undefined&& typeof obj.common.max === 'number'){
        tmp.max = parseFloat(obj.common.max);
    }
    tmp.role = obj.common.role || 'text';
    if(obj.common.unit !== undefined){
        tmp.unit = obj.common.unit;
    }
    if(obj.common.read === true || obj.common.read === "true"){
        tmp.read = true;
    }else{
        tmp.read = false;
    }
    if(obj.common.write === true || obj.common.write === "true"){
        tmp.write = true;
    }else{
        tmp.write = false;
    }
    if(obj.common.states !== undefined){
        tmp.states = statesStr2Obj(obj.common.states);
    }
    if(obj.common.custom && obj.common.custom.history0 && obj.common.custom.history0.enabled === true){
        obj.history = true;
    }else if(obj.common.custom && obj.common.custom.sql0 && obj.common.custom.sql0.enabled === true){
        obj.history = true;
    }else{
        obj.history = false;
    }
    tmp.ts = obj.ts || null;
    tmp.checksum = generateChecksum(id,tmp);

    return tmp;
}

function statesStr2Obj(states) {
    if (typeof states == 'string') {
        var arr = states.split(';');
        states = {};
        if(arr.length == 0){
            return null;
        }
        for(var i = 0; i < arr.length; i++) {
            var ele = arr[i].split(':');
            states[ele[0]] = ele[1];
        }
        return states;
    }
    if (typeof states == 'object') {
        return states;
    }
    return null;
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

function hasNullValues(obj) {
    for (var key in obj) {
        if (obj[key] == null)
            return true;
    }
    return false;
}


module.exports = {
    getAdapterObject,
    getHostObject,
    getInstanceObject,
    getEnumObject,
    getStateObject,
    getState,
    hasNullValues
};