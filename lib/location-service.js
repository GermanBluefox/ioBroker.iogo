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
            this.addLocation(data.key, data.val());
            this.updateLocation(data.key, data.val());
        });
        this.dbRef.on('child_changed', (data) => {
            this.adapter.log.info('location update received for key=' + data.key + ' data: ' + JSON.stringify(data.val()));
            this.updateLocation(data.key, data.val());
        });
    }

    addLocation(id, data){
        let deviceId = id;
        for(let locationId in data){
            let objId = 'iogo.0.' + deviceId + '.locations.' + locationId;

            this.adapter.setObjectNotExists(objId, {
                type: 'state',
                common: {
                    name: 'location',
                    desc: 'is device in area',
                    type: 'boolean',
                    role: 'indicator',
                    def: false,
                    read: true,
                    write: false
                },
                native: {}
            }, (err, obj) => {
                if (!err && obj) {
                    this.adapter.log.info('Objects for location (' + objId + ') created');
                }
            });
        }
    }

    updateLocation(id, data){
        let deviceId = id;
        for(let locationId in data){
            let objId = 'iogo.0.' + deviceId + '.locations.' + locationId;
            let newVal = (data[locationId] == "true");

            this.adapter.setState(objId, newVal);
        }
    }

}

module.exports = LocationService;