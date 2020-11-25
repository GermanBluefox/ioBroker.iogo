'use strict';

class SyncService{
    constructor(adapter, firestore, database, uid, name){
        this.adapter = adapter;
        this.firestore = firestore;
        this.database = database;
        this.uid = uid;
        this.name = name;

        this.localObjects = [];
        this.stateValues = {};
        this.stateSyncTime = {};
        this.colRef = this.firestore.collection("users").doc(this.uid).collection(this.name + 's');

    }

    deleteObject(id){
        let node = this._getNode(id);
        this.colRef.doc(node).delete();
        this.adapter.log.debug('object (' + this.name + ') ' + id + ' removed successfully');
    }

    syncObject(id, object){
        let node = this._getNode(id);
        if(object.checksum !== this.localObjects[node].checksum){
            this.colRef.doc(node).set(object)
                .then(() => {
                    this.adapter.log.debug('object (' + this.name + ') ' + id + ' saved successfully');
                })
                .catch((error) => {
                    this.adapter.log.error(error);
                });
        }
    }

    syncObjectList(objectList){
        let dbRef = this.firestore.collection("users").doc(this.uid).collection(this.name + 's');
        let remoteObjects = [];

        // load local objects
        for (let id in objectList) {
            let node = this._getNode(id);
            this.localObjects[node] = objectList[id];
        }

        //load remote objects
        dbRef.get().then((querySnapshot) => {
            querySnapshot.forEach(doc => {
                if(this.localObjects[doc.id] == null){
                    this.adapter.log.info('deleting ' + this.name + ': ' + doc.id);
                    dbRef.doc(doc.id).delete();
                }
                remoteObjects[doc.id] = doc.data();
            });

            for (let node in this.localObjects) {
                if(remoteObjects[node] == null || this.localObjects[node].checksum != remoteObjects[node].checksum){
                    this.adapter.log.info('uploading ' + this.name + ': ' + node);
                    dbRef.doc(node)
                        .set(this.localObjects[node])
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
            }
        });

    }

    syncState(id, node, state){
        let attr = id.substr(id.lastIndexOf(".")+1);
        let val = this.getStateVal(id, attr, state.val);

        if(val !== null){
            this.database.ref(this.name + 's/' + this.uid + '/' + node + '/' + attr).set(val, (error) => {
                if (error) {
                    this.adapter.log.error(error);
                } else {
                    this.adapter.log.debug(this.name + id + ' updated successfully');
                }
            });
        }
    }

    syncStateList(stateList){
        this.database.ref(this.name + 's/' + this.uid).set(stateList, (error) => {
            if (error) {
                this.adapter.log.error(error);
            } else {
                this.adapter.log.info('database initialized with ' + Object.keys(stateList).length + ' ' + this.name + ' values');
            }
        });
    }

    getStateVal(id, attr, stateVal){
        let val = null;
    
        if(attr === 'alive' || attr === 'connected'){
            if(this.stateValues[id] == null || this.stateValues[id] !== stateVal){
                val = stateVal;
                this.stateValues[id] = stateVal;
                this.stateSyncTime[id] = new Date().getTime();
            }
        }
        if(attr === 'diskFree' || attr === 'diskSize' || attr === 'diskWarning' 
        || attr === 'freemem' || attr === 'memAvailable' || attr === 'memHeapTotal' || attr === 'memHeapUsed' || attr === 'memRss')
        {
            let tmpval = Math.round(parseFloat(stateVal));
            if(this.stateValues[id] == null || (Math.abs((tmpval / this.stateValues[id])-1) > 0.05  && Math.abs(tmpval - this.stateValues[id]) > 5)) {
                val = tmpval;
                this.stateValues[id] = tmpval;
                this.stateSyncTime[id] = new Date().getTime();
            }
        }
    
        return val;
    }

    _getNode(id){
        //replace unsupported character  . # [ ] $ /
        return id.replace(/[.#\[\]\/$]/g,'_');
    }

}

module.exports = SyncService;