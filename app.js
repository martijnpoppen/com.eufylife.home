'use strict';

const Homey = require('homey');
const { EufyClean } = require('eufy-clean');
const { decrypt, sleep } = require('./lib/helpers.js');
const deprecation = require('./lib/deprecation.js');

class App extends Homey.App {
    trace() {
        console.trace.bind(this, '[log]').apply(this, arguments);
    }

    debug() {
        console.debug.bind(this, '[debug]').apply(this, arguments);
    }

    info() {
        console.log.bind(this, '[info]').apply(this, arguments);
    }

    log() {
        console.log.bind(this, '[log]').apply(this, arguments);
    }

    warn() {
        console.warn.bind(this, '[warn]').apply(this, arguments);
    }

    error() {
        console.error.bind(this, '[error]').apply(this, arguments);
    }

    fatal() {
        console.error.bind(this, '[fatal]').apply(this, arguments);
    }


    // -------------------- INIT ----------------------

    async onInit() {
        this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);
        this.deviceList = [];
        this.driversInitialized = false;
        this.appInitialized = false;
        this.eufyClean = null;
        this.initFlowActions();

        // Deprecated in favour of Anker Eufy — see lib/deprecation.js. Fire-and-forget: a Homey app
        // must finish onInit promptly, and nothing downstream depends on the notice being delivered.
        deprecation.notifyOnce(this).catch((error) => this.error(error));
    }

    // ---------------------------- GETTERS/SETTERS ----------------------------------
    async setDevice(device) {
        this.deviceList = [...this.deviceList, device];
    }

    async setDevices(devices) {
        this.deviceList = [...this.deviceList, ...devices];

        if (!this.driversInitialized) {
            this.driversInitialized = true;
            await sleep(2000);
            this.initEufyClean();
        }
    }

    async removeDevice(deviceId) {
        try {
            this.homey.app.log('removeDevice', deviceId);

            const filteredList = this.deviceList.filter((dl) => {
                const data = dl.getData();
                return data.id !== deviceId;
            });

            this.deviceList = filteredList;
        } catch (error) {
            this.error(error);
        }
    }

    async initDevices() {
        this.deviceList.every(async (device, index) => {
            await device.onStartup(index);
        });
    }

    async disableDevices() {
        this.deviceList.every(async (device, index) => {
            try {
                await device.disableDevice();    
            } catch (error) {
                console.log(error);
            }
            
        });
    }

    async enableDevices(loginData) {
        this.deviceList.every(async (device, index) => {
            device.setSettings({...loginData});
            await device.enableDevice();
        });
    }

    // -------------------------- EUFY CLEAN -------------------------
    async initEufyClean(driverUsername = null, driverPassword = null) {
        if (driverUsername && driverPassword) {
            // Initialize when called from driver

            this.eufyClean = new EufyClean(driverUsername, driverPassword);
            await this.eufyClean.init();

        } else if (!this.eufyClean && this.deviceList.length) {
            // Initialize on startup when there are paired devices

            const device = this.deviceList[0];
            const settings = device.getSettings();
            const { username, password } = settings;

            if(username && password) {
                this.eufyClean = new EufyClean(decrypt(username), decrypt(password) );
                await this.eufyClean.init();
                await this.initDevices();
            } else {
                // No login data found, initialize without login - only for LocalConnect
                this.eufyClean = new EufyClean();
                await this.initDevices();
            }
        }

        this.appInitialized = true;
    }

      async initFlowActions() {
        try {
            this.homey.flow.getActionCard('action_measure_clean_speed').registerRunListener(async (args, state) => {
                return await args.device._onCleanSpeedChanged(args.action_measure_clean_speed_type);
            });

            this.homey.flow.getActionCard('action_control_mode').registerRunListener(async (args, state) => {
                return await args.device._onControlModeChanged(args.action_control_mode_type);
            });

            this.homey.flow.getActionCard('action_scenes').registerRunListener(async (args, state) => {
                return await args.device._onControlModeChanged(args.action_scenes_type);
            });

            this.homey.flow.getActionCard('action_clean_params').registerRunListener(async (args, state) => {
                return await args.device._onCleanParamChanged({
                    cleanType: args.action_clean_params_cleantype,
                    cleanExtent: args.action_clean_params_cleanextent,
                    mopMode: args.action_clean_params_mopmode
                });
            });
        } catch (err) {
            this.homey.app.error(err);
        }
    }
}

module.exports = App;
