'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class AdapterSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'adapter');
    }

    onObjectChange(id, obj){
        if(obj === null){
            super.deleteObject(id);
        }else{
            let object = mapper.getAdapterObject(id, obj);
            super.syncObject(id, object);
        }
    }

    upload(){

        this.adapter.log.info('uploading adapter');
    
        this.adapter.getForeignObjects('*', 'adapter', (err, objects) => {
            
            let objectList = [];
            for (let id in objects) {
                objectList[id] = mapper.getAdapterObject(id, objects[id]);
            }

            super.syncObjectList(objectList);
        });
    
    }

    syncAvailableVersion(val){
        let object = JSON.parse(val);     

        // Get a new write batch
        let batch = this.firestore.batch();

        for (let key in object) {
            if (object.hasOwnProperty(key)) {
                let data = {};
                data.availableVersion = object[key].availableVersion;
                data.installedVersion = object[key].installedVersion;
                let ref = this.firestore.collection("users").doc(uid).collection('adapters').doc("system_adapter_" + key);
                batch.update(ref, data);
            }
        }

        // Commit the batch
        batch.commit().then(() => {
            this.adapter.log.info('database verions updated');
        });
    }

}

module.exports = AdapterSyncService;