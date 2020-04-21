'use strict';

class SyncService{
    constructor(adapter, firestore, database, uid, name){
        this.adapter = adapter;
        this.firestore = firestore;
        this.database = database;
        this.uid = uid;
        this.name = name;

        this.checksumMap = {};
        this.stateValues = {};
        this.stateSyncTime = {};
        this.colRefMeta = this.firestore.collection('users').doc(this.uid).collection('meta');
        this.colRef = this.firestore.collection("users").doc(this.uid).collection(this.name + 's');

        this._init();
    }

    _init(){
        this.loadChecksumMap();
    }

    loadChecksumMap(){
        this.colRefMeta.doc(this.name + 'ChecksumMap').get().then((doc) => {
            if (doc.exists) {
                this.checksumMap = doc.data();
                this.adapter.log.info(this.name + 'ChecksumMap' + '  geladen');
            }else{
                this.adapter.log.warn(this.name + 'ChecksumMap' + ' nicht geladen');
            }
        }).catch((error) => {
            this.adapter.log.error('Error getting document:', error);
        });
    }

    syncChecksum(){
        this.colRefMeta.doc(this.name + 'ChecksumMap').set(this.checksumMap);
    }

    deleteObject(id){
        let node = this._getNode(id);
        this.colRef.doc(node).delete();
        delete this.checksumMap[node];
        this.adapter.log.debug('object (' + this.name + ') ' + id + ' removed successfully');
        this.syncChecksum();
    }

    syncObject(id, object){
        let node = this._getNode(id);
        let checksum = object.checksum;
        if(checksum !== this.checksumMap[node]){
            this.colRef.doc(node).set(object)
                .then(() => {
                    this.adapter.log.debug('object (' + this.name + ') ' + id + ' saved successfully');
                })
                .catch((error) => {
                    this.adapter.log.error(error);
                });
            this.checksumMap[node] = object.checksum;
            this.syncChecksum();
        }
    }

    syncObjectList(objectList){
        let dbRef = this.firestore.collection("users").doc(this.uid).collection(this.name + 's');
        let allObjects = [];

        for (let id in objectList) {
            let node = this._getNode(id);
            let object = objectList[id];
            allObjects[node] = true;
            let checksum = object.checksum;
            if(checksum !== this.checksumMap[node]){
                this.adapter.log.debug('uploading ' + this.name + ': ' + node);
                dbRef.doc(node)
                    .set(object)
                    .catch((error) => {
                        this.adapter.log.error(error);
                    });
                this.checksumMap[node] = checksum;
            }
        }

        for(let x in this.checksumMap){
            if(allObjects[x] == null){
                dbRef.doc(x).delete();
                delete this.checksumMap[x];
            }
        }
        
        this.syncChecksum();
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