'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class EnumSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'enum');

        this.objectList = {};

        this.upload();
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] === true){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "enum"){
            if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                this.objectList[id] = true;
                let object = mapper.getEnumObject(id, obj);
                super.syncObject(id, object);
            }
        }
    }

    upload(){
        this.adapter.log.info('uploading enum');
    
        this.adapter.getForeignObjects('*', 'enum', (err, objects) => {
            
            let tmpList = [];

            for (let id in objects) {
                if(id.indexOf('enum.rooms.') === 0 || id.indexOf('enum.functions.') === 0){
                    tmpList[id] = mapper.getEnumObject(id, objects[id]);
                    this.objectList[id] = true;
                }
            }

            super.syncObjectList(tmpList);

        });

    }

}

module.exports = EnumSyncService;