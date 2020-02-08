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
            if(this.objectList[id] === true){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "instance"){
            this.objectList[id] = true;
            let object = mapper.getInstanceObject(id, obj);
            if(mapper.hasNullValues(object)){
                this.adapter.log.warn("InstanceObject is corrupt: " + id);
                return;
            }
            super.syncObject(id, object);
        }
    }

    onStateChange(id, state){
        if(id.indexOf('system.adapter.') === 0){
            let node = super._getNode(this._getInstanceFromId(id));
            super.syncState(id, node, state);
        }
    }

    upload(){

        this.adapter.log.info('uploading instance');
    
        this.adapter.getForeignObjects('*', 'instance', (err, objects) => {
            
            let tmpList = [];
            for (let id in objects) {
                let object = mapper.getInstanceObject(id, objects[id]);
                if(mapper.hasNullValues(object)){
                    this.adapter.log.warn("InstanceObject is corrupt: " + id);
                }else{
                    tmpList[id] = object;
                    this.objectList[id] = true;
                }
            }

            super.syncObjectList(tmpList);
        });

        this.adapter.getForeignStates('system.adapter.*', (err, states) => {
            
            let stateList = [];
            for (let id in states) {
                let node = super._getNode(this._getInstanceFromId(id));
                if(states[id] != null && id.lastIndexOf('upload') === -1){
                    if(stateList[node] === undefined){
                        stateList[node] = {};
                    }
                    if(stateList[node]['id'] === undefined){
                        stateList[node]['id'] = 'system.adapter.' + this._getInstanceFromId(id);
                    }
                    let attr = id.substr(id.lastIndexOf(".")+1);
                    let val = super.getStateVal(id, attr, states[id].val);
                    if(val !== null){
                        stateList[node][attr] = val;
                    }
                }
            }

            super.syncStateList(stateList);
        });
    }

    _getInstanceFromId(id){
        let tmp = id.substr(15);
        tmp = tmp.substr(0, tmp.lastIndexOf('.'));
        return tmp;
    }
    
}

module.exports = InstanceSyncService;