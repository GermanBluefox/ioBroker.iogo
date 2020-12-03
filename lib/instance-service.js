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

    async upload(){

        this.adapter.log.info('uploading instance');
    
        var tmpList = [];

        await this.adapter.getForeignObjects('*', 'instance', (err, objects) => {
            for(let id in objects){
                let tmpObj = objects[id];
                let object = mapper.getInstanceObject(id, tmpObj);
    
                if(mapper.hasNullValues(object)){
                    this.adapter.log.warn("InstanceObject is corrupt: " + id);
                }else{
                    tmpList[id] = object;
                    this.objectList[id] = tmpObj;
                }
            }
            super.syncObjectList(tmpList);
        });
    }
}

module.exports = InstanceSyncService;