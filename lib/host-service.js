'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class HostSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'host');
    }

    onObjectChange(id, obj){
        if(obj === null){
            super.deleteObject(id);
        }else{
            let object = mapper.getHostObject(id, obj);
            super.syncObject(id, object);
        }
    }

    onStateChange(id, state){
        let node = this._getNode(this._getHostFromId(id));
        super.syncState(id, node, state);
    }

    upload(){

        this.adapter.log.info('uploading host');
    
        this.adapter.getForeignObjects('*', 'host', (err, objects) => {
            
            let objectList = [];
            for (let id in objects) {
                objectList[id] = mapper.getHostObject(id, objects[id]);
            }

            super.syncObjectList(objectList);
        });

        this.adapter.getForeignStates('system.host.*', (err, states) => {
            
            let stateList = [];
            for (let id in states) {
                let node = this._getNode(this._getHostFromId(id));
                if(states[id] != null){
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