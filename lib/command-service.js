'use strict';

class CommandService{
    constructor(adapter, database, uid){
        this.adapter = adapter;
        this.database = database;
        this.uid = uid;

        this.dbCommandQueuesRef = this.database.ref('commandQueues/' + uid);

        this._init();
    }

    _init(){
        this.dbCommandQueuesRef.on('child_added', (data) => {
            this.adapter.log.debug('command received: ' + JSON.stringify(data.val()));
            let id = data.val().id;
            let command = data.val().command;
            
            if(command == 'stopInstance'){
                this.adapter.log.info('stopping instance');
                this.adapter.getForeignObject(id, (err, obj) => {
                    if (err) {
                        this.adapter.log.error(err);
                    } else {
                        this.adapter.log.info(JSON.stringify(obj));
                        if(obj.common.enabled){
                            obj.common.enabled = false;  // Intanz ausschalten    
                            this.adapter.setForeignObject(obj._id, obj, (err) => {
                                if (err) this.adapter.log.error(err);
                            });
                        }else{
                            this.adapter.log.warn('stopInstance: instance ' + id + ' already stopped')
                        }
                    }
                });
            }
            if(command == 'startInstance'){
                this.adapter.log.info('starting instance');
                this.adapter.getForeignObject(id, (err, obj) => {
                    if (err) {
                        this.adapter.log.error(err);
                    } else {
                        this.adapter.log.info(JSON.stringify(obj));
                        if(!obj.common.enabled){
                            obj.common.enabled = true;  // Intanz einschalten    
                            this.adapter.setForeignObject(obj._id, obj, (err) => {
                                if (err) this.adapter.log.error(err);
                            });
                        }else{
                            this.adapter.log.warn('startInstance: instance ' + id + ' already started')
                        }
                    }
                });
            }
    
            this.dbCommandQueuesRef.child(data.ref.key).remove();
        });
    }

    destroy(){
        if(this.dbCommandQueuesRef != undefined){
            this.dbCommandQueuesRef.off();
        }
    }

}

module.exports = CommandService;