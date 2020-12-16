'use strict';

class DeviceService{
    constructor(adapter, database, uid){
        this.adapter = adapter;
        this.database = database;
        this.uid = uid;

        this.dbDevicesRef = this.database.ref('devices/' + this.uid);
        this.objectList = {};
        this.objectAliveList = {};
        this.deviceAlive = false;

        this._init();
    }

    _init(){
        this.adapter.log.info('initialize app devices');
        this.adapter.getDevices((err, objects) => {
            for (let id in objects) {
                let deviceId = objects[id]["_id"];
                this.objectList[deviceId] = true;
                this.adapter.log.info('DeviceService initialized with device ' + deviceId);
            }
        });

        this.adapter.getStates('*.alive', (err, states) => {
            for (let id in states) {
                if(states[id] !== null){
                    this.calcDeviceAlive(id, states[id].val);
                }
            }
            this.adapter.log.info('DeviceService initialized with ' + this.objectAliveList.length + ' devices');
        });

        this.dbDevicesRef.on('child_added', (data) => {
            this.adapter.log.info('device update received: ' + JSON.stringify(data.val()));
            this.createDevice(data.key, data.val());
        });
        this.dbDevicesRef.on('child_changed', (data) => {
            this.adapter.log.info('device update received: ' + JSON.stringify(data.val()));
            this.setDevice(data.key, data.val());
        });
    }

    onObjectChange(id, obj){
        if(obj === null){
            if(this.objectList[id] === true){
                delete this.objectList[id];
                let deviceId = id.substr(id.lastIndexOf('.') + 1);
                this.database.ref('devices/' + this.uid + '/' + deviceId).set(null, (error) => {
                    if (error) {
                        this.adapter.log.error(error);
                    } else {
                        this.adapter.log.info('device ' + id + ' removed successfully');
                    }
                });
            }
        }
    }

    destoy(){
        if(this.dbDevicesRef != undefined){
            this.dbDevicesRef.off();
        }
    }

    onStateChange(id, state){
        if(id.indexOf("iogo.") === 0 && id.endsWith('.alive')){
            this.calcDeviceAlive(id, state.val);
        }
    }

    isAlive(){
        return this.deviceAlive;
    }

    calcDeviceAlive(id, val){
        if(val !== null){
            this.objectAliveList[id] = val;
        }else{
            delete this.objectAliveList[id];
        }
        this.deviceAlive = false;
        Object.values(this.objectAliveList).forEach(value=>{
            if(value === true){
                this.deviceAlive = true;
            }
        });
    }

    createDevice(id, data){
        // create device
        this.adapter.setObjectNotExists('iogo.0.' + id, {
            type: 'device',
            common: {
                name: data.name
            },
            native: {}
        });
        // create states
        this.adapter.setObjectNotExists('iogo.0.' + id + '.battery.level', {
            type: 'state',
            common: {
                name: 'battery level',
                desc: 'battery level of device ' + id,
                type: 'number',
                role: 'value.battery',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: false
            },
            native: {}
        }, (err, obj) => {
            if (!err && obj) {
                this.adapter.log.info('Objects for battery-level (' + id + ') created');
                this.adapter.setState('iogo.0.' + id + + '.battery.level', {val:data.batteryLevel, ack:true});
            }
        });
    
        this.adapter.setObjectNotExists('iogo.0.' + id + '.battery.charging', {
            type: 'state',
            common: {
                name: 'battery charging',
                desc: 'battery charging of device ' + id,
                type: 'boolean',
                role: 'indicator.charging',
                read: true,
                write: false
            },
            native: {}
        }, (err, obj) => {
            if (!err && obj) {
                this.adapter.log.info('Objects for battery-charging (' + id + ') created');
                this.adapter.setState('iogo.0.' + id + + '.battery.charging', {val:data.batteryCharging, ack:true});
            }
        });
    
        this.adapter.setObjectNotExists('iogo.0.' + id + '.name', {
            type: 'state',
            common: {
                name: 'device name',
                desc: 'name of device ' + id,
                type: 'string',
                role: 'info.name',
                read: true,
                write: false
            },
            native: {}
        }, (err, obj) => {
            if (!err && obj) {
                this.adapter.log.info('Objects for name (' + id + ') created');
                this.adapter.setState('iogo.0.' + id + + '.name', {val:data.name, ack:true});
            }
        });
    
        this.adapter.setObjectNotExists('iogo.0.' + id + '.token', {
            type: 'state',
            common: {
                name: 'device FCM token',
                desc: 'unique token to receive push notification to device ' + id,
                type: 'string',
                role: 'text',
                read: true,
                write: false
            },
            native: {}
        }, (err, obj) => {
            if (!err && obj) {
                this.adapter.log.info('Objects for token (' + id + ') created');
                this.adapter.setState('iogo.0.' + id + + '.token', {val:data.token, ack:true});
            }
        });
    
        this.adapter.setObjectNotExists('iogo.0.' + id + '.alive', {
            type: 'state',
            common: {
                name: 'device status',
                desc: 'indicator if device is online ' + id,
                type: 'boolean',
                role: 'info.reachable',
                read: true,
                write: false
            },
            native: {}
        }, (err, obj) => {
            if (!err && obj) {
                this.adapter.log.info('Objects for alive (' + id + ') created');
                this.adapter.setState('iogo.0.' + id + + '.alive', {val:data.alive, ack:true});
            }
        });
    }
    
    setDevice(id, data){
        this.adapter.setState(id + '.name', {val:data.name, ack:true});
        this.adapter.setState(id + '.battery.level', {val:data.batteryLevel, ack:true});
        this.adapter.setState(id + '.battery.charging', {val:data.batteryCharging, ack:true});
        this.adapter.setState(id + '.token', {val:data.token, ack:true});
        this.adapter.setState(id + '.alive', {val:data.alive, ack:true});
    }
}

module.exports = DeviceService;
