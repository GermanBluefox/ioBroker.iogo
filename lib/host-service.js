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
            if(this.objectList[id] === true){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "host"){
            this.objectList[id] = true;
            let object = mapper.getHostObject(id, obj);
            if(mapper.hasNullValues(object)){
                this.adapter.log.warn("HostObject is corrupt: " + id);
                return;
            }
            super.syncObject(id, object);
        }
    }

    onStateChange(id, state){
        if(id.indexOf('system.host.') === 0){
            let node = super._getNode(this._getHostFromId(id));
            super.syncState(id, node, state);
        }
    }

    upload(){

        this.adapter.log.info('uploading host');
    
        this.adapter.getForeignObjects('*', 'host', (err, objects) => {
            
            let tmpList = [];
            for (let id in objects) {
                let object = mapper.getHostObject(id, objects[id]);
                if(mapper.hasNullValues(object)){
                    this.adapter.log.warn("HostObject is corrupt: " + id);
                }else{
                    tmpList[id] = object;
                    this.objectList[id] = true;
                }
            }

            super.syncObjectList(tmpList);
        });

        this.adapter.getForeignStates('system.host.*', (err, states) => {
            
            let stateList = [];
            for (let id in states) {
                let node = super._getNode(this._getHostFromId(id));
                if(states[id] != null && id.indexOf('.plugins.') == -1){
                    if(stateList[node] === undefined){
                        stateList[node] = {};
                    }
                    if(stateList[node]['id'] === undefined){
                        stateList[node]['id'] = 'system.host.' + this._getHostFromId(id);
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

    _getHostFromId(id){
        let tmp = id.substr(12);
        tmp = tmp.substr(0, tmp.lastIndexOf('.'));
        return tmp;
    }
}

module.exports = HostSyncService;