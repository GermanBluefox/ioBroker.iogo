'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class HostSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'host');

        this.objectList = {};

        this.upload();
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] != undefined){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "host"){
            let alive;
            if(this.objectList[id] != undefined){
                alive = this.objectList[id].alive;
            }else{
                alive = false;
            }
            obj.alive = alive;
            obj.connected = false;
            this.objectList[id] = obj;
            let object = mapper.getHostObject(id, obj);
            if(mapper.hasNullValues(object)){
                this.adapter.log.warn("HostObject is corrupt: " + id);
                return;
            }
            super.syncObject(id, object);
        }
    }

    onStateChange(id, state){
        if(id.indexOf('system.host.*') === 0 && id.substr(id.lastIndexOf(".")+1) == 'alive'){
            let objId = id.substr(0,id.lastIndexOf("."));
            if(this.objectList[objId] == undefined){
                return;
            }
            let obj = this.objectList[objId];
            obj.alive = state.val;
            let object = mapper.getHostObject(objId, obj);
            super.syncObject(objId, object);
        }
    }

    async upload(){

        this.adapter.log.info('uploading host');
    
        var tmpList = [];
        var syncList = []

        await this.adapter.getForeignObjects('*', 'host', (err, objects) => {
            tmpList = objects;
        });

        await this.adapter.getForeignStates('system.host.*.alive', (err, states) => {

            for(let id in states){
                let objId = id.substr(0,id.lastIndexOf("."));
                if(tmpList[objId] != undefined){
                    let tmpObj = tmpList[objId];
                    if(states[id] != null){
                        tmpObj.alive = states[id].val;
                    }else{
                        tmpObj.alive = false;
                    }
        
                    let object = mapper.getHostObject(objId, tmpObj);
        
                    if(mapper.hasNullValues(object)){
                        this.adapter.log.warn("HostObject is corrupt: " + objId);
                    }else{
                        syncList[objId] = object;
                        this.objectList[objId] = tmpObj;
                    }
                }
            }

            super.syncObjectList(syncList);
        });
    }
}

module.exports = HostSyncService;