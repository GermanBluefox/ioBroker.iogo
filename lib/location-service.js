'use strict';

class LocationService{
    constructor(adapter, firestore, database, uid){
        this.adapter = adapter;
        this.firestore = firestore;
        this.database = database;
        this.uid = uid;

        this.dbRef = this.database.ref('locations/' + this.uid);
        this.objectList = {};

        this._init();
    }

    _init(){
        this.dbRef.on('child_added', (data) => {
            this.adapter.log.info('new location received for key=' + data.key + ' data: ' + JSON.stringify(data.val()));
            this.saveLocation(data.key, data.val());
        });
        this.dbRef.on('child_changed', (data) => {
            this.adapter.log.info('location update received for key=' + data.key + ' data: ' + JSON.stringify(data.val()));
            this.saveLocation(data.key, data.val());
        });
        this.adapter.getDevices((err, objects) => {
            for (let id in objects) {
                let deviceId = objects[id]["_id"];
                this.objectList[deviceId] = true;
                this.adapter.log.info('LocationService initialized with device ' + deviceId);
            }
        });
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] === true){
                delete this.objectList[id];
                let deviceId = id.substr(id.lastIndexOf('.') + 1);
                this.adapter.log.info('LocationService.onObjectChange deviceId:' + deviceId);
                this.database.ref('locations/' + this.uid + '/' + deviceId).set(null, (error) => {
                    if (error) {
                        this.adapter.log.error(error);
                    } else {
                        this.adapter.log.info('locations for device ' + id + ' removed successfully');
                    }
                });
            }
        }
    }

    saveLocation(id, data){
        let deviceId = id;
        for(let locationId in data){
            let objId = deviceId + '.locations.' + locationId;
            let newVal = data[locationId];

            this.adapter.setObjectNotExists(objId, {
                type: 'state',
                common: {
                    name: 'location',
                    desc: 'is device in area',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false
                },
                native: {}
            }, (err, obj) => {
                if (!err && obj) {
                    this.adapter.log.info('Objects for location (' + objId + ') created with val: ' + data[locationId]);
                    this.adapter.setState(objId, newVal);
                }
            });

            this.adapter.setState(objId, newVal);
        }
    }
}

module.exports = LocationService;