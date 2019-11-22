'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class StateSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'state');

        this.database = database;
        this.dbStateQueuesRef = {};
        this.enum_states = {};
        this.stateTypes = {};

        this._initMe();
    }

    _initMe(){
        this.dbStateQueuesRef = this.database.ref('stateQueues/' + super.uid);
        this.dbStateQueuesRef.on('child_added',(data) => {
            this.adapter.log.info('state update received: ' + JSON.stringify(data.val()));
            let id = data.val().id;
            let val = data.val().val;
            this._setState(id, val);
            this.dbStateQueuesRef.child(data.ref.key).remove();
        });
    }

    onObjectChange(id, obj){
        if(this.enum_states[id] === true){
            if(obj === null){
                super.deleteObject(id);
            }else{
                let object = mapper.getStateObject(id, obj);
                super.syncObject(id, object);
            }
        }
    }

    onStateChange(id, state){
        if(this.enum_states[id] === true){
            let tmp = mapper.getState(id, state);   
            let node = super._getNode(id); 
            
            if((this.stateValues[id] === null || this.stateValues[id] !== tmp.val) || state.from.indexOf('system.adapter.iogo') !== -1){
                this.stateValues[id] = tmp.val;
                this.database.ref('states/' + super.uid + '/' + node).set(tmp, (error) => {
                    if (error) {
                        this.adapter.log.error(error);
                    } else {
                        this.adapter.log.debug('state ' + id + ' saved successfully');
                    }
                });
            }
        }
    }

    checkEnumMembers(id, obj){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            let object = mapper.getEnumObject(id, obj);

            for (let key in object.members) {
                this.enum_states[object.members[key]] = true;
            }
        }
    }

    upload(){

        this.adapter.log.info('uploading state');

        this.adapter.getForeignObjects('*', 'enum', (err, objects) => {
            
            for (let id in objects) {
                if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                    for (let key in object.members) {
                        this.enum_states[object.members[key]] = true;
                    }
                }
            }

            this.adapter.getForeignObjects('*', 'state', (err, objects) => {
            
                let objectList = [];
                for (let id in objects) {
                    if(this.enum_states[id] === true){
                        this.stateTypes[id] = objects[id].common.type;
                        objectList[id] = mapper.getStateObject(id, objects[id]);
                    }
                }
    
                super.syncObjectList(objectList);
            });

            this.adapter.getForeignStates('*', (err, states) => {
        
                let stateList = [];
                for (let id in states) {
                    if(this.enum_states[id] === true){
                        let node = getNode(id);
                        if(states[id] != null){
                            let tmp = mapper.getState(id, states[id]);
                            
                            if(typeof states[id].val !== this.stateTypes[id]){
                                this.adapter.log.warn('Value of state ' + id + ' has wrong type');
                            }
                            this.stateValues[id] = tmp.val;
                            stateList[node] = tmp;
                        }
                    }
                }
        
                //super.syncStateList(stateList);
            });

        });
    
    }

    destroy(){
        if(this.dbStateQueuesRef != undefined){
            this.dbStateQueuesRef.off();
        }
    }

    _setState(id, val){
        let newVal = val;
        if(this.stateTypes[id] == "number"){
            newVal = parseFloat(val);
        }else if(this.stateTypes[id] == "boolean"){
            newVal = (val == "true");
        }
        if(id.indexOf('iogo.') === 1){
            this.adapter.setState(id, newVal);
        }else{
            this.adapter.setForeignState(id, newVal);
        }
    }

}

module.exports = StateSyncService;