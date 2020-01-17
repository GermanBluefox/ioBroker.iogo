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
    }

    saveLocation(id, data){
        let deviceId = id;
        for(let locationId in data){
            let objId = 'iogo.0.' + deviceId + '.locations.' + locationId;
            this.adapter.setObjectNotExists(id, {
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
                    let newVal = (data[locationId] == "true");
                    this.adapter.log.info('Objects for location (' + objId + ') created');
                    this.adapter.setState(objId, newVal);
                }
            });
        }
    }

}

module.exports = LocationService;