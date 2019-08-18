'use strict';

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
    tmp.id = id;
    tmp.name = name;
    tmp.title = obj.common.title;
    tmp.availableVersion = obj.common.version;
    tmp.installedVersion = obj.common.installedVersion;
    tmp.desc = desc;
    tmp.mode = obj.common.mode || "unknown";
    tmp.icon = obj.common.icon;
    tmp.extIcon = obj.common.extIcon;
    tmp.enabled = obj.common.enabled;
    tmp.type = obj.common.type;
    tmp.ts = obj.ts;

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
    tmp.installedVersion = obj.common.installedVersion;
    tmp.hostname = obj.common.hostname;
    tmp.platform = obj.native.os.platform;
    tmp.totalmem = obj.native.hardware.totalmem;
    tmp.type = obj.common.type;
    tmp.ts = obj.ts;

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
    tmp.loglevel = obj.common.loglevel;
    tmp.host = obj.common.host;
    tmp.extIcon = obj.common.extIcon;
    tmp.enabled = obj.common.enabled;
    tmp.ts = obj.ts;

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
    tmp.type = obj.common.type;
    tmp.min = obj.common.min;
    tmp.max = obj.common.max;
    tmp.role = obj.common.role;
    tmp.unit = obj.common.unit;
    tmp.read = obj.common.read;
    tmp.write = obj.common.write;
    tmp.states = obj.common.states;
    if(obj.common.custom && obj.common.custom.history0 && obj.common.custom.history0.enabled === true){
        obj.history = true;
    }else if(obj.common.custom && obj.common.custom.sql0 && obj.common.custom.sql0.enabled === true){
        obj.history = true;
    }else{
        obj.history = false;
    }
    tmp.ts = obj.ts;

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

module.exports = {
    getAdapterObject,
    getHostObject,
    getInstanceObject,
    getEnumObject,
    getStateObject,
    getState
};