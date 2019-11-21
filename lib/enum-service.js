'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class EnumSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'enum');
    }

    onObjectChange(id, obj){
        if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
            if(obj === null){
                super.deleteObject(id);
            }else{
                let object = mapper.getEnumObject(id, obj);
                super.syncObject(id, object);
            }
        }
    }

    upload(){
        this.adapter.log.info('uploading enum');
    
        this.adapter.getForeignObjects('*', 'enum', (err, objects) => {
            
            let objectList = [];
            let enum_states = [];

            for (let id in objects) {
                if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                    objectList[id] = mapper.getEnumObject(id, objects[id]);
                    for (let key in object.members) {
                        enum_states[object.members[key]] = true;
                    }
                }
            }

            super.syncObjectList(objectList);

        });

    }

}

module.exports = EnumSyncService;