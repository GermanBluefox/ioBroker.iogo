'use strict';

const SyncService = require('./sync-service');
const mapper = require('./mapper.js');

class AdapterSyncService extends SyncService{
    constructor(adapter, firestore, database, uid){
        super(adapter, firestore, database, uid, 'adapter');

        this.objectList = {};

        this.upload();
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] === true){
                delete this.objectList[id];
                super.deleteObject(id);
            }
        }else if (obj.type === "adapter"){
            this.objectList[id] = true;
            let object = mapper.getAdapterObject(id, obj);
            super.syncObject(id, object);
        }
    }

    upload(){

        this.adapter.log.info('uploading adapter');
    
        this.adapter.getForeignObjects('*', 'adapter', (err, objects) => {
            
            let tmpList = [];
            for (let id in objects) {
                this.objectList[id] = true;
                tmpList[id] = mapper.getAdapterObject(id, objects[id]);
            }

            super.syncObjectList(tmpList);
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