'use strict';

const Homey = require('homey');
const flowActions = require('./lib/flow/actions.js');

class App extends Homey.App {
    log() {
        console.log.bind(this, '[log]').apply(this, arguments);
    }

    error() {
        console.error.bind(this, '[error]').apply(this, arguments);
    }

    // -------------------- INIT ----------------------

    async onInit() {
        this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);
        this.deviceList = [];

        flowActions.init(this.homey);
    }

    // ---------------------------- GETTERS/SETTERS ----------------------------------
    async setDevice(device) {
        this.deviceList = [...this.deviceList, device];
    }

    async setDevices(devices) {
        this.deviceList = [...this.deviceList, ...devices];
    }
}

module.exports = App;
