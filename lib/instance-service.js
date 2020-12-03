'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class InstanceSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'instance');

        this.objectList = {};

        this.upload();
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] != undefined){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "instance"){
            let alive;
            if(this.objectList[id] != undefined){
                alive = this.objectList[id].alive;
            }else{
                alive = false;
            }
            obj.alive = alive;
            this.objectList[id] = obj;
            let object = mapper.getInstanceObject(id, obj);
            if(mapper.hasNullValues(object)){
                this.adapter.log.warn("InstanceObject is corrupt: " + id);
                return;
            }
            super.syncObject(id, object);
        }
    }

    onStateChange(id, state){
        if(id.indexOf('system.adapter.') === 0 && id.substr(id.lastIndexOf(".")+1) == 'alive'){
            let objId = id.substr(0,id.lastIndexOf("."));
            if(this.objectList[objId] == undefined){
                return;
            }
            let obj = this.objectList[objId];
            obj.alive = state.val;
            let object = mapper.getInstanceObject(objId, obj);
            super.syncObject(objId, object);
        }
    }

    async upload(){

        this.adapter.log.info('uploading instance');
    
        var tmpList = [];

        await this.adapter.getForeignObjects('*', 'instance', (err, objects) => {
            tmpList = objects;
        });

        await this.adapter.getForeignStates('system.adapter.*.alive', (err, states) => {

            for(let id in states){
                let objId = id.substr(0,id.lastIndexOf("."));
                if(tmpList[objId] != undefined){
                    let tmpObj = tmpList[objId];
                    tmpObj.alive = false;
                    if(states[id] != null){
                        tmpObj.alive = states[id].val;
                    }
                    tmpObj.connected = false;
        
                    let object = mapper.getInstanceObject(objId, tmpObj);
        
                    if(mapper.hasNullValues(object)){
                        this.adapter.log.warn("InstanceObject is corrupt: " + objId);
                    }else{
                        tmpList[objId] = object;
                        this.objectList[objId] = tmpObj;
                    }
                }
            }

            super.syncObjectList(tmpList);
        });
    }
}

module.exports = InstanceSyncService;