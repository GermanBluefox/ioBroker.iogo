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

    getLocalObject(id){
        let node = this._getNode(id);
        return this.localObjects[node];
    }

    deleteObject(id){
        let node = this._getNode(id);
        this.colRef.doc(node).delete();
        this.adapter.log.debug('object (' + this.name + ') ' + id + ' removed successfully');
    }

    syncObject(id, object){
        let node = this._getNode(id);
        if(this.localObjects[node] == undefined || object.checksum !== this.localObjects[node].checksum){
            this.localObjects[node] = object;
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
        this.adapter.log.info('found ' + Object.keys(this.localObjects).length + ' local objects: ' + this.name);

        //load remote objects
        dbRef.get().then((querySnapshot) => {
            this.adapter.log.info('checking remote: ' + this.name);

            querySnapshot.forEach(doc => {
                if(this.localObjects[doc.id] == null){
                    this.adapter.log.info('deleting ' + this.name + ': ' + doc.id);
                    dbRef.doc(doc.id).delete();
                }
                remoteObjects[doc.id] = doc.data();
            });
            this.adapter.log.info('found ' + Object.keys(remoteObjects).length + ' remote objects: ' + this.name);

            for (let node in this.localObjects) {
                if(remoteObjects[node] == undefined || this.localObjects[node].checksum != remoteObjects[node].checksum){
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

    syncStateList(stateList){
        this.database.ref(this.name + 's/' + this.uid).set(stateList, (error) => {
            if (error) {
                this.adapter.log.error(error);
            } else {
                this.adapter.log.info('database initialized with ' + Object.keys(stateList).length + ' ' + this.name + ' values');
            }
        });
    }

    _getNode(id){
        //replace unsupported character  . # [ ] $ /
        return id.replace(/[.#\[\]\/$]/g,'_');
    }

}

module.exports = SyncService;